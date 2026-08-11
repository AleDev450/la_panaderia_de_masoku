-- =============================================================================
-- LA PANCA — Motor de emparejamiento de apuestas
-- 0002_functions.sql: RPC en PL/pgSQL. Todo el matching y la liquidación
-- viven aquí (no en el cliente ni en JS del servidor) para garantizar
-- atomicidad real y bloqueo de filas seguro bajo concurrencia.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- crear_apuesta
--
-- 1. Valida evento abierto y saldo suficiente.
-- 2. Retiene el monto (disponible → retenido) y registra el movimiento.
-- 3. Inserta la apuesta.
-- 4. Empareja FIFO contra el lado contrario con FOR UPDATE SKIP LOCKED,
--    para que dos transacciones concurrentes nunca tomen la misma orden
--    pendiente ni emparejen el mismo dinero dos veces.
-- 5. Actualiza estados y registra cada emparejamiento.
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

  -- Bloquea la fila del evento: serializa contra resolver_evento y contra
  -- otra creación de apuesta que intente validar el mismo estado a la vez.
  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;
  if v_evento.estado <> 'abierto' then
    raise exception 'El evento no está abierto para apuestas' using errcode = 'P0003';
  end if;

  -- Bloquea el perfil del usuario para leer/actualizar su saldo sin carreras.
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

  -- Auto-matching bloqueado por defecto: excluye órdenes del mismo usuario_id.
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

-- Grant restringido a service_role: estas funciones confían en el
-- p_usuario_id que reciben como parámetro (no lo derivan de auth.uid()),
-- así que solo el servidor Next.js (que ya validó la sesión real antes
-- de llamar) puede invocarlas. Un cliente `authenticated` con la anon key
-- NO puede llamarlas directo — evita suplantar p_usuario_id.
revoke all on function crear_apuesta(uuid, uuid, lado_apuesta, numeric) from public;
grant execute on function crear_apuesta(uuid, uuid, lado_apuesta, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- cancelar_apuesta
--
-- Solo cancela la porción monto_pendiente (no emparejada) de una apuesta
-- propia, y solo mientras el evento siga abierto. Si la apuesta ya tenía
-- parte emparejada, esa parte sigue en juego; el estado final queda
-- 'completa' (no requiere más acción de matching) o 'cancelada' si nunca
-- llegó a emparejar nada.
-- ---------------------------------------------------------------------------

create or replace function cancelar_apuesta(
  p_apuesta_id uuid,
  p_usuario_id uuid
)
returns apuestas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apuesta apuestas%rowtype;
  v_evento eventos%rowtype;
begin
  select * into v_apuesta from apuestas where id = p_apuesta_id for update;
  if not found then
    raise exception 'Apuesta no encontrada' using errcode = 'P0010';
  end if;
  if v_apuesta.usuario_id <> p_usuario_id then
    raise exception 'No autorizado para cancelar esta apuesta' using errcode = 'P0011';
  end if;

  select * into v_evento from eventos where id = v_apuesta.evento_id for update;
  if v_evento.estado <> 'abierto' then
    raise exception 'Solo se pueden cancelar apuestas de eventos abiertos' using errcode = 'P0012';
  end if;

  if v_apuesta.estado = 'cancelada' or v_apuesta.monto_pendiente <= 0 then
    raise exception 'No hay monto pendiente para cancelar' using errcode = 'P0013';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible + v_apuesta.monto_pendiente,
        saldo_retenido = saldo_retenido - v_apuesta.monto_pendiente
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id)
  values (p_usuario_id, 'cancelacion', v_apuesta.monto_pendiente, p_apuesta_id, v_apuesta.evento_id);

  update apuestas
    set monto_pendiente = 0,
        estado = (case when monto_matcheado > 0 then 'completa' else 'cancelada' end)::estado_apuesta
    where id = p_apuesta_id
    returning * into v_apuesta;

  return v_apuesta;
end;
$$;

revoke all on function cancelar_apuesta(uuid, uuid) from public;
grant execute on function cancelar_apuesta(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- resolver_evento (solo admin)
--
-- 1. Marca el evento como resuelto con su resultado.
-- 2. Devuelve todo monto_pendiente no emparejado a saldo_disponible.
-- 3. Paga monto_matcheado * 1.80 a los ganadores; libera el retenido de
--    ganadores y perdedores.
-- 4. Calcula y registra la comisión total de la plataforma: 0.20 por cada
--    unidad de "monto" emparejado (ver 0001_schema.sql para la derivación).
-- ---------------------------------------------------------------------------

create or replace function resolver_evento(
  p_evento_id uuid,
  p_resultado lado_apuesta,
  p_admin_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_apuesta record;
  v_payout numeric(12, 2);
  v_comision_total numeric(12, 2);
begin
  -- p_admin_id llega explícito (igual que p_usuario_id en crear_apuesta /
  -- cancelar_apuesta) porque esta función se invoca desde el servidor con
  -- el cliente service_role, que no lleva el JWT del usuario y por lo
  -- tanto no puede depender de auth.uid(). El servidor Next.js resuelve
  -- p_admin_id desde la sesión real antes de llamar a este RPC.
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede resolver un evento' using errcode = 'P0020';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0021';
  end if;
  if v_evento.estado = 'resuelto' then
    raise exception 'El evento ya fue resuelto' using errcode = 'P0022';
  end if;

  update eventos
    set estado = 'resuelto', resultado = p_resultado
    where id = p_evento_id;

  -- Devuelve todo lo no emparejado.
  for v_apuesta in
    select * from apuestas
    where evento_id = p_evento_id and monto_pendiente > 0
    for update
  loop
    update perfiles
      set saldo_disponible = saldo_disponible + v_apuesta.monto_pendiente,
          saldo_retenido = saldo_retenido - v_apuesta.monto_pendiente
      where id = v_apuesta.usuario_id;

    insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id)
    values (v_apuesta.usuario_id, 'devolucion', v_apuesta.monto_pendiente, v_apuesta.id, p_evento_id);

    update apuestas
      set monto_pendiente = 0,
          estado = (case when monto_matcheado > 0 then 'completa' else 'cancelada' end)::estado_apuesta
      where id = v_apuesta.id;
  end loop;

  -- Liquida lo emparejado: paga ganadores, libera retenido de todos.
  for v_apuesta in
    select * from apuestas
    where evento_id = p_evento_id and monto_matcheado > 0
    for update
  loop
    if v_apuesta.lado = p_resultado then
      v_payout := round(v_apuesta.monto_matcheado * 1.80, 2);

      update perfiles
        set saldo_disponible = saldo_disponible + v_payout,
            saldo_retenido = saldo_retenido - v_apuesta.monto_matcheado
        where id = v_apuesta.usuario_id;

      insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id)
      values (v_apuesta.usuario_id, 'pago_ganancia', v_payout, v_apuesta.id, p_evento_id);
    else
      update perfiles
        set saldo_retenido = saldo_retenido - v_apuesta.monto_matcheado
        where id = v_apuesta.usuario_id;
    end if;
  end loop;

  -- Comisión de plataforma: 0.20 por cada unidad de monto emparejado.
  select coalesce(round(sum(monto) * 0.20, 2), 0) into v_comision_total
  from emparejamientos
  where evento_id = p_evento_id;

  insert into comisiones_plataforma (evento_id, monto)
  values (p_evento_id, v_comision_total);
end;
$$;

revoke all on function resolver_evento(uuid, lado_apuesta, uuid) from public;
grant execute on function resolver_evento(uuid, lado_apuesta, uuid) to service_role;
