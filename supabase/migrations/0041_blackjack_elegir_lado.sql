-- =============================================================================
-- LA PANCA — Blackjack: el jugador elige lado, y si está ocupado se abre mesa
-- 0041_blackjack_elegir_lado.sql
--
-- LO QUE ESTABA MAL. `unirse_blackjack` (0039) sentaba a la gente donde
-- hubiera hueco: al primero en A, al segundo en B. Pero el lado no es un
-- detalle de acomodo — decide si juegas la mano o si apuestas al host
-- (0040). Elegirlo es del jugador.
--
-- CÓMO QUEDA. Se entra pidiendo un lado:
--
--   1. Si en alguna mesa de la familia ESE lado está libre, te sientas ahí
--      (la más vieja primero: se llena una antes de abrir otra).
--   2. Si no queda ninguna con ese lado libre, se abre una mesa nueva y te
--      sientas en el lado que pediste, con tu monto, a esperar retador.
--
-- Que es exactamente el caso "A vs B, entra C": la mesa está llena, así que
-- C no entra ahí — se le abre la siguiente y queda esperando en el lado que
-- eligió.
--
-- Nunca se rebota por "asiento ocupado": ocupado significa mesa nueva, no
-- error. El único rechazo posible es no tener saldo.
--
-- Cambia la firma, así que hay que soltar la anterior antes de crear esta.
-- =============================================================================

drop function if exists unirse_blackjack(uuid, numeric);

create or replace function unirse_blackjack(
  p_usuario_id uuid,
  p_lado lado_apuesta,
  p_monto numeric
)
returns table (
  apuesta_id uuid,
  evento_id uuid,
  lado lado_apuesta,
  monto_total numeric,
  monto_matcheado numeric,
  monto_pendiente numeric,
  mesa_nombre text,
  mesa_nueva boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa eventos%rowtype;
  v_sala eventos%rowtype;
  v_apuesta apuestas%rowtype;
  v_numero integer;
  v_nueva boolean := false;
begin
  -- Serializa TODAS las entradas a blackjack. Sin esto, dos jugadores que
  -- piden el mismo lado en el mismo instante ven el mismo asiento libre: o
  -- uno se lleva un error feo, o los dos abren mesa y quedan dos a medias
  -- en vez de una completa. `select ... for update` no alcanza: con
  -- `limit 1`, si la fila deja de calificar tras el lock la consulta
  -- devuelve vacío en vez de pasar a la siguiente. A esta escala, gratis.
  perform pg_advisory_xact_lock(hashtext('unirse_blackjack')::bigint);

  select * into v_mesa
  from eventos
  where categoria = 'blackjack'
    and mesa_origen_id is null
    and estado = 'abierto'
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'No hay ninguna mesa de blackjack abierta' using errcode = 'P0261';
  end if;

  -- Una mesa de la familia con ESE lado libre, donde el jugador no esté ya.
  select * into v_sala
  from eventos e
  where e.categoria = 'blackjack'
    and e.estado = 'abierto'
    and e.resultado_preliminar is null
    and coalesce(e.mesa_origen_id, e.id) = v_mesa.id
    and not exists (
      select 1 from apuestas a
      where a.evento_id = e.id and a.usuario_id = p_usuario_id and a.estado <> 'cancelada'
    )
    and not exists (
      select 1 from apuestas a
      where a.evento_id = e.id and a.lado = p_lado and a.estado <> 'cancelada'
    )
  order by e.created_at asc
  limit 1;

  if not found then
    -- El lado que quiere está tomado en todas: mesa nueva, numerada dentro
    -- de su familia.
    select count(*) + 1 into v_numero
    from eventos
    where coalesce(mesa_origen_id, id) = v_mesa.id;

    insert into eventos (nombre, lado_a, lado_b, categoria, estado, cierra_en, mesa_origen_id)
    values (
      v_mesa.nombre || ' · Mesa ' || v_numero,
      v_mesa.lado_a,
      v_mesa.lado_b,
      'blackjack',
      'abierto',
      -- Sin reloj, igual que 0023: nunca vence en la práctica.
      now() + interval '100 years',
      v_mesa.id
    )
    returning * into v_sala;

    v_nueva := true;
  end if;

  v_apuesta := crear_apuesta(p_usuario_id, v_sala.id, p_lado, p_monto);

  return query
  select
    v_apuesta.id,
    v_apuesta.evento_id,
    v_apuesta.lado,
    v_apuesta.monto_total,
    v_apuesta.monto_matcheado,
    v_apuesta.monto_pendiente,
    v_sala.nombre,
    v_nueva;
end;
$$;

revoke all on function unirse_blackjack(uuid, lado_apuesta, numeric) from public;
grant execute on function unirse_blackjack(uuid, lado_apuesta, numeric) to service_role;
