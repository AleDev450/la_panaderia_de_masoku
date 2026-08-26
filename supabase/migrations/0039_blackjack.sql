-- =============================================================================
-- LA PANCA — Blackjack: mesas 1v1, sin reloj, con señal de turno
-- 0039_blackjack.sql
--
-- QUÉ ES Y QUÉ NO ES. La app NO reparte cartas ni cuenta puntos: las cartas
-- las reparte el staff por fuera y el ganador se declara con el mismo flujo
-- de siempre (declarar → ventana de corrección → confirmar, 0013). Lo que
-- se agrega acá es el andamio: mesas de dos personas que se generan solas,
-- sin límite de tiempo, y una señal de turno para que el que reparte vea en
-- vivo quién está pidiendo carta y quién ya se plantó.
--
-- LO 1v1 ES LA CANTIDAD DE PERSONAS, NO EL MONTO. Una mesa admite UNA
-- apuesta por lado y nada más. Los montos siguen emparejándose como en todo
-- el resto del motor: si A pone 20 y B pone 10, se emparejan 10, se paga
-- 1.80 sobre eso, la casa se queda 0.20, y los 10 que nadie cubrió le
-- vuelven a A al liquidar. No hay nada especial que hacer para eso — es
-- justamente lo que `crear_apuesta` y `liquidar_evento` ya hacen.
--
-- SIN RELOJ. Se reusa el truco de 0023: `cierra_en` 100 años al futuro en
-- vez de volverla nullable. Así todo el código que compara contra `now()`
-- sigue funcionando sin tocarse.
--
-- MESAS QUE SE CLONAN. El staff publica UNA mesa madre (la primera). De ahí
-- en adelante, cuando alguien entra y no queda ningún asiento libre, la mesa
-- se clona sola. `mesa_origen_id` apunta a la mesa madre para poder agrupar
-- y numerar; en la madre es null.
--
-- OJO AL CORRER ESTA MIGRACIÓN: `alter type ... add value` no permite USAR
-- el valor nuevo en la misma transacción en que se agrega. Acá 'blackjack'
-- solo aparece dentro de cuerpos plpgsql (que no se evalúan al crearlos),
-- así que corre de una. Si aun así el editor se queja, corre la primera
-- sentencia sola y después el resto.
-- =============================================================================

alter type categoria_evento add value if not exists 'blackjack';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_turno') then
    create type estado_turno as enum ('esperando', 'pidiendo', 'quedado');
  end if;
end;
$$;

alter table eventos
  add column if not exists mesa_origen_id uuid references eventos (id),
  add column if not exists turno_a estado_turno not null default 'esperando',
  add column if not exists turno_b estado_turno not null default 'esperando',
  add column if not exists cartas_a integer not null default 0,
  add column if not exists cartas_b integer not null default 0;

create index if not exists idx_eventos_mesa_origen on eventos (mesa_origen_id, created_at);

comment on column eventos.mesa_origen_id is
  'Mesa madre de la que salió esta sala de blackjack (0039). Null en la que publicó el staff.';
comment on column eventos.turno_a is
  'Señal de turno del lado A (0039): pidiendo = espera carta, quedado = se plantó. La app no reparte cartas, solo avisa.';
comment on column eventos.cartas_a is
  'Cuántas cartas pidió el lado A en esta mano (0039) — para que el que reparte lleve la cuenta.';

-- ---------------------------------------------------------------------------
-- crear_apuesta: una sola apuesta por lado en blackjack.
--
-- La regla vive acá y no solo en `unirse_blackjack` a propósito: cualquiera
-- que llame a `crear_apuesta` contra una mesa de blackjack (el panel de
-- staff, un script, un bug futuro) tiene que toparse con el mismo límite.
-- Mismo cuerpo de 0036 + este chequeo.
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
  v_perfil perfiles%rowtype;
  v_nueva_apuesta apuestas%rowtype;
  v_restante numeric(12, 2);
  v_lado_contrario lado_apuesta;
  v_orden record;
  v_monto_par numeric(12, 2);
  v_es_fake boolean;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0001';
  end if;
  p_monto := round(p_monto, 2);

  if p_monto < 10 or p_monto > 100 then
    raise exception 'La apuesta debe estar entre S/10 y S/100' using errcode = 'P0007';
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

  -- Blackjack: la mesa es de dos personas, una por lado. El monto sí se
  -- empareja parcial como en todo el resto — lo que se limita es cuánta
  -- gente se sienta.
  if v_evento.categoria = 'blackjack' and exists (
    select 1 from apuestas
    where evento_id = p_evento_id
      and lado = p_lado
      and estado <> 'cancelada'
  ) then
    raise exception 'Ese asiento ya está ocupado' using errcode = 'P0260';
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

  v_es_fake := v_perfil.saldo_fake >= p_monto;

  if not v_es_fake and v_perfil.saldo_disponible < p_monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0005';
  end if;

  if v_es_fake then
    update perfiles
      set saldo_fake = saldo_fake - p_monto,
          saldo_fake_retenido = saldo_fake_retenido + p_monto
      where id = p_usuario_id;
  else
    update perfiles
      set saldo_disponible = saldo_disponible - p_monto,
          saldo_retenido = saldo_retenido + p_monto
      where id = p_usuario_id;
  end if;

  insert into movimientos_saldo (usuario_id, tipo, monto, evento_id, es_fake)
  values (p_usuario_id, 'retencion', p_monto, p_evento_id, v_es_fake);

  insert into apuestas (evento_id, usuario_id, lado, monto_total, monto_matcheado, monto_pendiente, estado, es_fake)
  values (p_evento_id, p_usuario_id, p_lado, p_monto, 0, p_monto, 'pendiente', v_es_fake)
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
-- unirse_blackjack: sienta al jugador donde haya sitio, o abre mesa nueva.
--
-- El lock de asesoría serializa TODAS las entradas a blackjack. Sin él, dos
-- jugadores que entran en el mismo instante pueden ver el mismo asiento
-- libre y uno se lleva un error feo — o peor, los dos abren mesa nueva y
-- quedan dos mesas a medias en vez de una completa. `select ... for update`
-- no alcanza acá: con `limit 1`, si la fila deja de calificar tras el lock,
-- la consulta devuelve vacío en vez de pasar a la siguiente.
-- A la escala de esto, serializar es gratis.
-- ---------------------------------------------------------------------------

create or replace function unirse_blackjack(
  p_usuario_id uuid,
  p_monto numeric
)
returns apuestas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa eventos%rowtype;
  v_sala eventos%rowtype;
  v_lado lado_apuesta;
  v_numero integer;
begin
  perform pg_advisory_xact_lock(hashtext('unirse_blackjack')::bigint);

  -- La mesa madre: la que publicó el staff (sin origen) y sigue abierta.
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

  -- Una sala de esta mesa con asiento libre donde el jugador no esté ya.
  -- La más vieja primero: se llena una antes de abrir la siguiente.
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
    and not (
      exists (select 1 from apuestas a where a.evento_id = e.id and a.lado = 'a' and a.estado <> 'cancelada')
      and
      exists (select 1 from apuestas a where a.evento_id = e.id and a.lado = 'b' and a.estado <> 'cancelada')
    )
  order by e.created_at asc
  limit 1;

  if found then
    v_lado := case
      when not exists (
        select 1 from apuestas a
        where a.evento_id = v_sala.id and a.lado = 'a' and a.estado <> 'cancelada'
      ) then 'a'
      else 'b'
    end;
  else
    -- No quedaba sitio: mesa nueva, numerada dentro de su familia.
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

    v_lado := 'a';
  end if;

  return crear_apuesta(p_usuario_id, v_sala.id, v_lado, p_monto);
end;
$$;

revoke all on function unirse_blackjack(uuid, numeric) from public;
grant execute on function unirse_blackjack(uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- marcar_turno: el jugador avisa que pide carta o que se planta.
--
-- Solo puede marcar quien está sentado en esa mesa, y solo sobre su propio
-- lado — el lado sale de su apuesta, no de un parámetro, para que nadie
-- pueda plantar al rival.
--
-- Plantarse es definitivo dentro de la mano: una vez `quedado` no se vuelve
-- a pedir. Si el staff necesita deshacerlo (se marcó por error), reinicia la
-- mano con `admin_reiniciar_turnos`.
-- ---------------------------------------------------------------------------

create or replace function marcar_turno(
  p_usuario_id uuid,
  p_evento_id uuid,
  p_accion text
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_lado lado_apuesta;
  v_turno estado_turno;
begin
  if p_accion not in ('pedir', 'quedarse') then
    raise exception 'Acción inválida' using errcode = 'P0262';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Mesa no encontrada' using errcode = 'P0263';
  end if;
  if v_evento.categoria <> 'blackjack' then
    raise exception 'Esta mesa no es de blackjack' using errcode = 'P0264';
  end if;
  if v_evento.estado <> 'abierto' then
    raise exception 'Esta mano ya terminó' using errcode = 'P0265';
  end if;

  select lado into v_lado
  from apuestas
  where evento_id = p_evento_id
    and usuario_id = p_usuario_id
    and estado <> 'cancelada'
  limit 1;

  if v_lado is null then
    raise exception 'No estás sentado en esta mesa' using errcode = 'P0266';
  end if;

  v_turno := case when v_lado = 'a' then v_evento.turno_a else v_evento.turno_b end;
  if v_turno = 'quedado' then
    raise exception 'Ya te plantaste en esta mano' using errcode = 'P0267';
  end if;

  if v_lado = 'a' then
    update eventos
      set turno_a = (case when p_accion = 'pedir' then 'pidiendo' else 'quedado' end)::estado_turno,
          cartas_a = cartas_a + (case when p_accion = 'pedir' then 1 else 0 end)
      where id = p_evento_id
      returning * into v_evento;
  else
    update eventos
      set turno_b = (case when p_accion = 'pedir' then 'pidiendo' else 'quedado' end)::estado_turno,
          cartas_b = cartas_b + (case when p_accion = 'pedir' then 1 else 0 end)
      where id = p_evento_id
      returning * into v_evento;
  end if;

  return v_evento;
end;
$$;

revoke all on function marcar_turno(uuid, uuid, text) from public;
grant execute on function marcar_turno(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- admin_servir_carta: el que reparte confirma que ya dio la carta.
--
-- Devuelve el lado a 'esperando'. Sin esto, quien pidió se queda marcado
-- como "pidiendo" para siempre y no hay forma de distinguir "ya le di la
-- carta" de "quiere otra".
-- ---------------------------------------------------------------------------

create or replace function admin_servir_carta(
  p_admin_id uuid,
  p_evento_id uuid,
  p_lado lado_apuesta
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede repartir' using errcode = 'P0270';
  end if;

  update eventos
    set turno_a = case when p_lado = 'a' and turno_a = 'pidiendo' then 'esperando' else turno_a end,
        turno_b = case when p_lado = 'b' and turno_b = 'pidiendo' then 'esperando' else turno_b end
    where id = p_evento_id and categoria = 'blackjack'
    returning * into v_evento;

  if not found then
    raise exception 'Mesa de blackjack no encontrada' using errcode = 'P0271';
  end if;

  return v_evento;
end;
$$;

revoke all on function admin_servir_carta(uuid, uuid, lado_apuesta) from public;
grant execute on function admin_servir_carta(uuid, uuid, lado_apuesta) to service_role;

-- ---------------------------------------------------------------------------
-- admin_reiniciar_turnos: deja la mesa como recién sentados.
--
-- Para cuando alguien se plantó por error o hay que repetir la mano. No
-- toca las apuestas ni el saldo — solo la señal de turno.
-- ---------------------------------------------------------------------------

create or replace function admin_reiniciar_turnos(
  p_admin_id uuid,
  p_evento_id uuid
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0272';
  end if;

  update eventos
    set turno_a = 'esperando', turno_b = 'esperando', cartas_a = 0, cartas_b = 0
    where id = p_evento_id and categoria = 'blackjack'
    returning * into v_evento;

  if not found then
    raise exception 'Mesa de blackjack no encontrada' using errcode = 'P0273';
  end if;

  return v_evento;
end;
$$;

revoke all on function admin_reiniciar_turnos(uuid, uuid) from public;
grant execute on function admin_reiniciar_turnos(uuid, uuid) to service_role;
