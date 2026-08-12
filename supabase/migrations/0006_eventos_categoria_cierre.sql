-- =============================================================================
-- LA PANCA — Motor de emparejamiento de apuestas
-- 0006_eventos_categoria_cierre.sql: /partidas pasa a correr sobre este
-- motor real (antes usaba un mock aparte en localStorage) — agrega lo que
-- le faltaba a `eventos` para ese caso de uso: categoría del juego y una
-- hora de cierre para nuevas apuestas (el mock tenía `duracionMin` /
-- "título cerrado"; aquí se resuelve con `cierra_en` + un check en
-- `crear_apuesta`, sin cron: nadie más apuesta después de esa hora, pero
-- la resolución sigue siendo una acción manual del admin, igual que hoy).
-- =============================================================================

-- Postgres no tiene `create type if not exists`; el DO block deja la
-- migración re-ejecutable sin chocar con "type already exists".
do $$
begin
  if not exists (select 1 from pg_type where typname = 'categoria_evento') then
    create type categoria_evento as enum ('dota2', 'csgo', 'lol', 'valorant', 'otros');
  end if;
end
$$;

alter table eventos
  add column if not exists categoria categoria_evento not null default 'otros',
  add column if not exists cierra_en timestamptz not null default (now() + interval '10 minutes');

-- ---------------------------------------------------------------------------
-- crear_apuesta: mismo cuerpo que 0002_functions.sql, con un solo check
-- nuevo al principio (evento cerrado por tiempo). Se repite el resto de la
-- función completa porque `create or replace` reemplaza el cuerpo entero.
-- ---------------------------------------------------------------------------

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
  v_saldo_disponible numeric(12, 2);
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

  select saldo_disponible into v_saldo_disponible
  from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0004';
  end if;
  if v_saldo_disponible < p_monto then
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
  v_lado_contrario := case when p_lado = 'a' then 'b' else 'a' end;

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
