-- =============================================================================
-- LA PANCA — Controles de administración
-- 0010_admin_control.sql:
--   1. Baneo de usuarios por incumplimiento.
--   2. El admin no apuesta: `crear_apuesta` lo rechaza explícitamente.
--   3. Abrir/cerrar apuestas a mano, sin esperar al contador.
--   4. Métricas del día para el panel (depositado, pagado, ganancia).
--
-- Sobre "cerrado": el enum `estado_evento` ya tenía ese estado desde
-- 0001 pero nada lo usaba. Ahora es el punto intermedio real del ciclo:
-- abierto (acepta apuestas) → cerrado (ya no, pero todavía sin resultado
-- declarado) → resuelto (pagado). El admin puede forzar ese paso cuando
-- quiera; el contador `cierra_en` sigue siendo el camino automático.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Baneo
-- ---------------------------------------------------------------------------

alter table perfiles
  add column if not exists baneado boolean not null default false,
  add column if not exists baneado_motivo text,
  add column if not exists baneado_at timestamptz,
  add column if not exists baneado_por uuid references perfiles (id);

-- Se guarda por separado de un simple borrado: un usuario baneado
-- conserva su historial y su saldo, solo no puede seguir apostando.
-- La columna queda lista para un futuro baneo por IP (una tabla aparte
-- de IPs bloqueadas, que este esquema no incluye todavía).

-- ---------------------------------------------------------------------------
-- crear_apuesta: mismo cuerpo, con dos rechazos nuevos al principio —
-- admin y usuario baneado. Se repite la función entera porque
-- `create or replace` reemplaza el cuerpo completo.
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

  -- Bloquea el perfil para leer/actualizar su saldo sin carreras, y de
  -- paso valida rol y baneo sobre la misma fila.
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

-- ---------------------------------------------------------------------------
-- admin_banear_usuario (solo admin)
--
-- No borra nada: el usuario conserva saldo e historial, solo deja de poder
-- apostar (ver el check en crear_apuesta). Un admin no puede banearse a sí
-- mismo ni banear a otro admin.
-- ---------------------------------------------------------------------------

create or replace function admin_banear_usuario(
  p_admin_id uuid,
  p_usuario_id uuid,
  p_banear boolean,
  p_motivo text default null
)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede suspender cuentas' using errcode = 'P0060';
  end if;
  if p_admin_id = p_usuario_id then
    raise exception 'No puedes suspender tu propia cuenta' using errcode = 'P0061';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0062';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'No puedes suspender a otro administrador' using errcode = 'P0063';
  end if;

  update perfiles
    set baneado = p_banear,
        baneado_motivo = case when p_banear then p_motivo else null end,
        baneado_at = case when p_banear then now() else null end,
        baneado_por = case when p_banear then p_admin_id else null end
    where id = p_usuario_id
    returning * into v_perfil;

  return v_perfil;
end;
$$;

revoke all on function admin_banear_usuario(uuid, uuid, boolean, text) from public;
grant execute on function admin_banear_usuario(uuid, uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- admin_cambiar_estado_evento (solo admin)
--
-- Abrir o cerrar las apuestas a mano. Al reabrir, si el contador ya venció
-- se empuja hacia adelante: sin eso el evento quedaría "abierto" pero
-- `crear_apuesta` seguiría rechazando por tiempo.
-- No toca eventos ya resueltos: el dinero ya se repartió.
-- ---------------------------------------------------------------------------

create or replace function admin_cambiar_estado_evento(
  p_admin_id uuid,
  p_evento_id uuid,
  p_abrir boolean,
  p_minutos integer default 10
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
    raise exception 'Solo un administrador puede abrir o cerrar apuestas' using errcode = 'P0070';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0071';
  end if;
  if v_evento.estado = 'resuelto' then
    raise exception 'El evento ya fue resuelto' using errcode = 'P0072';
  end if;

  if p_abrir then
    update eventos
      set estado = 'abierto',
          cierra_en = case
            when cierra_en <= now() then now() + make_interval(mins => greatest(coalesce(p_minutos, 10), 1))
            else cierra_en
          end
      where id = p_evento_id
      returning * into v_evento;
  else
    update eventos set estado = 'cerrado' where id = p_evento_id
    returning * into v_evento;
  end if;

  return v_evento;
end;
$$;

revoke all on function admin_cambiar_estado_evento(uuid, uuid, boolean, integer) from public;
grant execute on function admin_cambiar_estado_evento(uuid, uuid, boolean, integer) to service_role;

-- ---------------------------------------------------------------------------
-- admin_metricas (solo admin)
--
-- Los números del panel. "Hoy" es el día calendario del servidor.
-- La ganancia de la plataforma es la comisión de 0.20 por unidad
-- emparejada que ya registra `resolver_evento` en comisiones_plataforma —
-- no se recalcula acá, solo se suma.
-- ---------------------------------------------------------------------------

create or replace function admin_metricas(p_admin_id uuid)
returns table (
  depositado_hoy numeric,
  pagado_hoy numeric,
  ganancia_hoy numeric,
  ganancia_total numeric,
  usuarios_total bigint,
  usuarios_baneados bigint,
  eventos_abiertos bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0080';
  end if;

  return query
  select
    coalesce((
      select sum(r.monto_acreditado) from recargas r
      where r.estado = 'aprobada' and r.revisado_at >= date_trunc('day', now())
    ), 0)::numeric,
    coalesce((
      select sum(m.monto) from movimientos_saldo m
      where m.tipo = 'pago_ganancia' and m.created_at >= date_trunc('day', now())
    ), 0)::numeric,
    coalesce((
      select sum(c.monto) from comisiones_plataforma c
      where c.created_at >= date_trunc('day', now())
    ), 0)::numeric,
    coalesce((select sum(c.monto) from comisiones_plataforma c), 0)::numeric,
    (select count(*) from perfiles where rol = 'user'),
    (select count(*) from perfiles where rol = 'user' and baneado),
    (select count(*) from eventos where estado = 'abierto');
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;
