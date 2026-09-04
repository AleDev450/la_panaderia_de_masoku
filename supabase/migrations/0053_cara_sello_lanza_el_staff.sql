-- =============================================================================
-- CACHUDOBET — La moneda la lanza el STAFF, y la mesa se ve en vivo
-- 0053_cara_sello_lanza_el_staff.sql
--
-- QUÉ CAMBIA. En 0050 la moneda caía sola en cuanto el rival se sentaba:
-- `unirse_cara_sello` sorteaba y pagaba en la misma llamada. Nadie más se
-- enteraba de que esa mesa existía, y el duelo se resolvía antes de que
-- pudiera verse.
--
-- Ahora la mesa se llena y QUEDA ESPERANDO. Igual que una mesa de blackjack
-- (0039), cualquiera puede verla con los dos jugadores sentados y saber quién
-- se enfrenta a quién. El staff aprieta "Lanzar moneda" y ahí recién cae —
-- con todos mirando el mismo lanzamiento, igual que el giro de la ruleta.
--
-- EL CICLO:
--   esperando  → alguien abrió mesa y falta rival
--   lista      → los dos sentados, la plata retenida, esperando al staff
--   resuelta   → la moneda cayó, ya se pagó
--   cancelada  → se devolvió lo retenido
--
-- SINCRONIZACIÓN. Igual que la ruleta (0048): `admin_lanzar_moneda` decide,
-- paga y ESCRIBE el resultado, y recién al final fija
-- `lanza_inicia_en = now() + 3s`. Todos los clientes anclan la animación a esa
-- marca del servidor, así que la moneda cae en el mismo lado y en el mismo
-- instante en todas las pantallas — el que se entera tarde se engancha al
-- lanzamiento ya empezado.
--
-- DOBLE LANZAMIENTO IMPOSIBLE: `for update` sobre la sala + exigir que
-- `resultado` siga en null. Dos clics simultáneos y el segundo se encuentra
-- la fila ya escrita.
--
-- La plata no cambia de manos distinto que en 0050: los dos ponen el mismo
-- monto, el ganador cobra 1.8x y la casa se queda la diferencia. Lo único que
-- se movió es CUÁNDO cae la moneda y quién aprieta el botón.
-- =============================================================================

alter table cara_sello_salas
  add column if not exists lanza_inicia_en timestamptz;

comment on column cara_sello_salas.lanza_inicia_en is
  'Instante del servidor en que arranca la animación (0053). Todos los clientes anclan el lanzamiento a esta marca, así ven la misma moneda caer en el mismo momento.';

-- El estado nuevo entra al check. El nombre del constraint es el que Postgres
-- le puso solo al declararlo inline en 0050.
alter table cara_sello_salas drop constraint if exists cara_sello_salas_estado_check;
alter table cara_sello_salas
  add constraint cara_sello_salas_estado_check
  check (estado in ('esperando', 'lista', 'resuelta', 'cancelada'));

-- Una sola mesa pendiente por persona, ahora contando también las que ya
-- están llenas: mientras el staff no lance, esa plata sigue retenida.
drop index if exists idx_una_sala_abierta_por_usuario;
create unique index if not exists idx_una_sala_abierta_por_usuario
  on cara_sello_salas (creador_id)
  where estado in ('esperando', 'lista');

-- ---------------------------------------------------------------------------
-- unirse_cara_sello: ahora solo SIENTA al rival. Ya no lanza nada.
--
-- Se le retiene el monto igual que al que abrió: la apuesta queda viva
-- esperando al staff, así que su plata no puede seguir disponible.
-- ---------------------------------------------------------------------------

create or replace function unirse_cara_sello(
  p_usuario_id uuid,
  p_sala_id uuid
)
returns cara_sello_salas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sala cara_sello_salas%rowtype;
  v_perfil perfiles%rowtype;
begin
  select * into v_sala from cara_sello_salas where id = p_sala_id for update;
  if not found then
    raise exception 'Sala no encontrada' using errcode = 'P0400';
  end if;
  if v_sala.estado <> 'esperando' then
    raise exception 'Esta sala ya no está disponible' using errcode = 'P0401';
  end if;
  if v_sala.creador_id = p_usuario_id then
    raise exception 'No puedes jugar contra ti mismo' using errcode = 'P0402';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0403';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede apostar' using errcode = 'P0404';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0405';
  end if;
  if v_perfil.saldo_disponible < v_sala.monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0406';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible - v_sala.monto,
        saldo_retenido = saldo_retenido + v_sala.monto
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (p_usuario_id, 'retencion', v_sala.monto, false);

  update cara_sello_salas
    set estado = 'lista',
        rival_id = p_usuario_id
    where id = p_sala_id
    returning * into v_sala;

  return v_sala;
end;
$$;

revoke all on function unirse_cara_sello(uuid, uuid) from public;
grant execute on function unirse_cara_sello(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- admin_lanzar_moneda: EL botón. Decide, paga y deja escrito el resultado
-- ANTES de que ninguna pantalla empiece a animar.
-- ---------------------------------------------------------------------------

create or replace function admin_lanzar_moneda(
  p_admin_id uuid,
  p_sala_id uuid
)
returns cara_sello_salas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sala cara_sello_salas%rowtype;
  v_lado_rival text;
  v_resultado text;
  v_ganador uuid;
  v_premio numeric(12, 2);
  v_comision numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede lanzar la moneda' using errcode = 'P0420';
  end if;

  select * into v_sala from cara_sello_salas where id = p_sala_id for update;
  if not found then
    raise exception 'Sala no encontrada' using errcode = 'P0421';
  end if;
  if v_sala.resultado is not null then
    raise exception 'Esta moneda ya se lanzó' using errcode = 'P0422';
  end if;
  if v_sala.estado <> 'lista' then
    raise exception 'La mesa todavía no está completa' using errcode = 'P0423';
  end if;
  if v_sala.rival_id is null then
    raise exception 'Falta el rival' using errcode = 'P0424';
  end if;

  -- Los DOS perfiles, siempre en el mismo orden (por id): sin esto, dos
  -- mesas cruzadas lanzadas a la vez pueden entrar en deadlock.
  perform 1 from perfiles
    where id in (v_sala.creador_id, v_sala.rival_id)
    order by id
    for update;

  v_lado_rival := case when v_sala.lado_creador = 'cara' then 'sello' else 'cara' end;

  -- Acá cae la moneda.
  v_resultado := case when random() < 0.5 then 'cara' else 'sello' end;
  v_ganador := case
    when v_resultado = v_sala.lado_creador then v_sala.creador_id
    else v_sala.rival_id
  end;

  v_premio := round(v_sala.monto * v_sala.multiplicador, 2);
  -- La comisión es el RESTO del pozo, no un segundo redondeo.
  v_comision := (v_sala.monto * 2) - v_premio;

  -- Los dos sueltan lo retenido; el ganador recibe el premio completo.
  update perfiles
    set saldo_retenido = saldo_retenido - v_sala.monto
    where id in (v_sala.creador_id, v_sala.rival_id);

  update perfiles
    set saldo_disponible = saldo_disponible + v_premio
    where id = v_ganador;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (v_ganador, 'premio_cara_sello', v_premio, false);

  -- Una fila por jugador: `cara_sello_jugadas` sigue siendo el historial por
  -- persona, y con eso las métricas de 0052 no se tocan.
  insert into cara_sello_jugadas (
    usuario_id, eleccion, resultado, monto, gano, pago, multiplicador, sala_id
  )
  values
    (
      v_sala.creador_id, v_sala.lado_creador, v_resultado, v_sala.monto,
      v_resultado = v_sala.lado_creador,
      case when v_resultado = v_sala.lado_creador then v_premio else 0 end,
      v_sala.multiplicador, v_sala.id
    ),
    (
      v_sala.rival_id, v_lado_rival, v_resultado, v_sala.monto,
      v_resultado = v_lado_rival,
      case when v_resultado = v_lado_rival then v_premio else 0 end,
      v_sala.multiplicador, v_sala.id
    );

  update cara_sello_salas
    set estado = 'resuelta',
        resultado = v_resultado,
        ganador_id = v_ganador,
        premio = v_premio,
        comision = v_comision,
        resuelta_at = now(),
        -- Se fija al final, con el resultado ya guardado: cuando la primera
        -- pantalla se entera de que hay que animar, la moneda ya cayó acá.
        lanza_inicia_en = now() + interval '3 seconds'
    where id = p_sala_id
    returning * into v_sala;

  return v_sala;
end;
$$;

revoke all on function admin_lanzar_moneda(uuid, uuid) from public;
grant execute on function admin_lanzar_moneda(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- cancelar_sala_cara_sello: ahora también puede deshacer una mesa llena.
--
-- Si el staff no va a lanzar (se cayó el evento, se armó mal), la plata de
-- los DOS tiene que volver. Una mesa ya llena solo la cancela el staff: el
-- que abrió no puede dejar plantado al que se sentó.
-- ---------------------------------------------------------------------------

create or replace function cancelar_sala_cara_sello(
  p_usuario_id uuid,
  p_sala_id uuid
)
returns cara_sello_salas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sala cara_sello_salas%rowtype;
  v_es_admin boolean;
begin
  select * into v_sala from cara_sello_salas where id = p_sala_id for update;
  if not found then
    raise exception 'Sala no encontrada' using errcode = 'P0410';
  end if;
  if v_sala.resultado is not null then
    raise exception 'Esta moneda ya se lanzó' using errcode = 'P0413';
  end if;

  v_es_admin := es_admin(p_usuario_id);

  if v_sala.estado = 'esperando' then
    if v_sala.creador_id <> p_usuario_id and not v_es_admin then
      raise exception 'Esta sala no es tuya' using errcode = 'P0411';
    end if;

    update perfiles
      set saldo_retenido = saldo_retenido - v_sala.monto,
          saldo_disponible = saldo_disponible + v_sala.monto
      where id = v_sala.creador_id;

    insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
    values (v_sala.creador_id, 'devolucion', v_sala.monto, false);

  elsif v_sala.estado = 'lista' then
    if not v_es_admin then
      raise exception 'La mesa ya está completa: solo el staff puede cancelarla'
        using errcode = 'P0414';
    end if;

    -- Les vuelve a los dos.
    update perfiles
      set saldo_retenido = saldo_retenido - v_sala.monto,
          saldo_disponible = saldo_disponible + v_sala.monto
      where id in (v_sala.creador_id, v_sala.rival_id);

    insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
    values
      (v_sala.creador_id, 'devolucion', v_sala.monto, false),
      (v_sala.rival_id, 'devolucion', v_sala.monto, false);

  else
    raise exception 'Esta sala ya no se puede cancelar' using errcode = 'P0412';
  end if;

  update cara_sello_salas
    set estado = 'cancelada'
    where id = p_sala_id
    returning * into v_sala;

  return v_sala;
end;
$$;

revoke all on function cancelar_sala_cara_sello(uuid, uuid) from public;
grant execute on function cancelar_sala_cara_sello(uuid, uuid) to service_role;
