-- =============================================================================
-- LA PANCA — Apuesta mínima S/5 y requisito de apuesta para retirar
-- 0016_limites_y_requisito_retiro.sql
--
-- 1. APUESTA MÍNIMA baja de S/10 a S/5 (la recarga mínima se queda en S/10,
--    ya estaba así desde 0009). Se repite `crear_apuesta` entera porque
--    `create or replace` reemplaza el cuerpo completo — es el mismo cuerpo
--    de 0013_resolucion_en_dos_fases.sql con un solo número cambiado.
--
-- 2. REQUISITO PARA RETIRAR: recargar y retirar sin jugar de por medio abre
--    la puerta a usar esto como lavado de fichas. Por cada recarga
--    aprobada, el jugador tiene que haber apostado (monto EMPAREJADO, no
--    lo que declaró al crear la apuesta) al menos S/5 antes de poder
--    retirar cualquier monto. Se usa `monto_matcheado` y no `monto_total`
--    a propósito: una apuesta que nunca encuentra rival se devuelve entera
--    al cerrar el evento, así que contarla dejaría "apostar contra uno
--    mismo" (que nunca empareja, ver crear_apuesta) como forma gratis de
--    cumplir el requisito.
--
--    `requisito_retiro` centraliza el cálculo para que la Server Action que
--    muestra el progreso en /retirar y el chequeo real dentro de
--    `solicitar_retiro` usen exactamente los mismos números.
-- =============================================================================

create or replace function crear_apuesta(
  p_usuario_id uuid,
  p_evento_id uuid,
  p_lado lado_apuesta,
  p_monto numeric
)
returns apuestas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_perfil perfiles%rowtype;
  v_nueva_apuesta apuestas%rowtype;
  v_restante numeric(12, 2);
  v_lado_contrario lado_apuesta;
  v_orden record;
  v_monto_par numeric(12, 2);
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0001';
  end if;
  p_monto := round(p_monto, 2);

  if p_monto < 5 or p_monto > 100 then
    raise exception 'La apuesta debe estar entre S/5 y S/100' using errcode = 'P0007';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;
  if v_evento.estado <> 'abierto' then
    raise exception 'El evento no está abierto para apuestas' using errcode = 'P0003';
  end if;
  if now() > v_evento.cierra_en then
    raise exception 'El título ya cerró para nuevas apuestas' using errcode = 'P0006';
  end if;

  v_lado_contrario := case when p_lado = 'a' then 'b' else 'a' end;

  if exists (
    select 1 from apuestas
    where evento_id = p_evento_id
      and usuario_id = p_usuario_id
      and lado = v_lado_contrario
      and estado <> 'cancelada'
  ) then
    raise exception 'Ya apostaste al otro lado de esta sala' using errcode = 'P0100';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0004';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede apostar' using errcode = 'P0008';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0009';
  end if;
  if v_perfil.saldo_disponible < p_monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0005';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible - p_monto,
        saldo_retenido = saldo_retenido + p_monto
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, evento_id)
  values (p_usuario_id, 'retencion', p_monto, p_evento_id);

  insert into apuestas (evento_id, usuario_id, lado, monto_total, monto_matcheado, monto_pendiente, estado)
  values (p_evento_id, p_usuario_id, p_lado, p_monto, 0, p_monto, 'pendiente')
  returning * into v_nueva_apuesta;

  v_restante := p_monto;

  for v_orden in
    select id, monto_pendiente
    from apuestas
    where evento_id = p_evento_id
      and lado = v_lado_contrario
      and estado in ('pendiente', 'parcial')
      and monto_pendiente > 0
      and usuario_id <> p_usuario_id
    order by created_at asc
    for update skip locked
  loop
    exit when v_restante <= 0;

    v_monto_par := least(v_restante, v_orden.monto_pendiente);

    update apuestas
      set monto_matcheado = monto_matcheado + v_monto_par,
          monto_pendiente = monto_pendiente - v_monto_par,
          estado = (case when monto_pendiente - v_monto_par <= 0 then 'completa' else 'parcial' end)::estado_apuesta
      where id = v_orden.id;

    update apuestas
      set monto_matcheado = monto_matcheado + v_monto_par,
          monto_pendiente = monto_pendiente - v_monto_par,
          estado = (case when monto_pendiente - v_monto_par <= 0 then 'completa' else 'parcial' end)::estado_apuesta
      where id = v_nueva_apuesta.id;

    insert into emparejamientos (evento_id, apuesta_a_id, apuesta_b_id, monto)
    values (
      p_evento_id,
      case when p_lado = 'a' then v_nueva_apuesta.id else v_orden.id end,
      case when p_lado = 'a' then v_orden.id else v_nueva_apuesta.id end,
      v_monto_par
    );

    v_restante := v_restante - v_monto_par;
  end loop;

  select * into v_nueva_apuesta from apuestas where id = v_nueva_apuesta.id;
  return v_nueva_apuesta;
end;
$$;

revoke all on function crear_apuesta(uuid, uuid, lado_apuesta, numeric) from public;
grant execute on function crear_apuesta(uuid, uuid, lado_apuesta, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- requisito_retiro: cuánto se exige apostar (emparejado) por recarga
-- aprobada, y cuánto lleva apostado el jugador.
-- ---------------------------------------------------------------------------

create or replace function requisito_retiro(p_usuario_id uuid)
returns table(recargas_aprobadas integer, monto_apostado numeric, monto_requerido numeric)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*)::integer from recargas
      where usuario_id = p_usuario_id and estado = 'aprobada') as recargas_aprobadas,
    coalesce((select sum(monto_matcheado) from apuestas
      where usuario_id = p_usuario_id), 0) as monto_apostado,
    5 * (select count(*) from recargas
      where usuario_id = p_usuario_id and estado = 'aprobada') as monto_requerido;
$$;

revoke all on function requisito_retiro(uuid) from public;
grant execute on function requisito_retiro(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- solicitar_retiro: mismo cuerpo de 0012_retiros.sql, con el chequeo nuevo
-- insertado justo antes de retener el saldo.
-- ---------------------------------------------------------------------------

create or replace function solicitar_retiro(
  p_usuario_id uuid,
  p_monto numeric
)
returns retiros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
  v_retiro retiros%rowtype;
  v_requisito record;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0090';
  end if;
  p_monto := round(p_monto, 2);
  if p_monto < 10 then
    raise exception 'El retiro mínimo es S/10' using errcode = 'P0091';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0092';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no tiene saldo de juego' using errcode = 'P0093';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0094';
  end if;
  if v_perfil.phone is null or v_perfil.phone = '' then
    raise exception 'Necesitas un teléfono registrado para retirar' using errcode = 'P0095';
  end if;
  if v_perfil.saldo_disponible < p_monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0096';
  end if;

  select * into v_requisito from requisito_retiro(p_usuario_id);
  if v_requisito.monto_apostado < v_requisito.monto_requerido then
    raise exception 'Debes apostar al menos S/5 por cada recarga antes de retirar — te falta apostar S/%',
      round(v_requisito.monto_requerido - v_requisito.monto_apostado, 2)
      using errcode = 'P0127';
  end if;

  -- Retiene el monto: sale de disponible pero todavía no del sistema.
  update perfiles
    set saldo_disponible = saldo_disponible - p_monto,
        saldo_retenido = saldo_retenido + p_monto
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto)
  values (p_usuario_id, 'retencion', p_monto);

  insert into retiros (usuario_id, monto, telefono_destino)
  values (p_usuario_id, p_monto, v_perfil.phone)
  returning * into v_retiro;

  return v_retiro;
end;
$$;

revoke all on function solicitar_retiro(uuid, numeric) from public;
grant execute on function solicitar_retiro(uuid, numeric) to service_role;
