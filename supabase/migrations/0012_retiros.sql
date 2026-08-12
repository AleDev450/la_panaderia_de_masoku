-- =============================================================================
-- LA PANCA — Retiros de saldo
-- 0012_retiros.sql: el jugador pide retirar, el staff yapea y marca pagado.
--
-- La decisión central: **el monto se retiene al solicitar**, no al pagar.
-- Si el saldo siguiera disponible mientras la solicitud espera, el mismo
-- dinero podría pedirse dos veces o apostarse antes de que el staff lo
-- yapee. Por eso `solicitar_retiro` mueve el monto de `saldo_disponible`
-- a `saldo_retenido` en la misma transacción que crea la solicitud —
-- exactamente igual que hace `crear_apuesta` con una apuesta.
--
-- El destino del retiro es el teléfono registrado en `perfiles`, no uno
-- que el jugador escriba al momento: ese número solo se cambia con
-- aprobación del staff (0008), así que usarlo acá cierra el círculo — el
-- dinero sale al mismo número con el que se verificó que entró.
-- =============================================================================

-- `alter type ... add value` no puede usar el valor nuevo en la misma
-- transacción, pero sí definir funciones que lo mencionen (el cuerpo
-- plpgsql no se evalúa al crearlas). Si tu cliente SQL se queja, corre
-- esta línea sola y luego el resto del archivo.
alter type tipo_movimiento_saldo add value if not exists 'retiro';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_retiro') then
    create type estado_retiro as enum ('pendiente', 'pagado', 'rechazado');
  end if;
end
$$;

create table if not exists retiros (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id) on delete cascade,
  monto numeric(12, 2) not null check (monto > 0),
  /** Copia del teléfono al momento de pedir: si luego cambia, el staff
      necesita saber a qué número se prometió pagar este retiro. */
  telefono_destino text not null,
  estado estado_retiro not null default 'pendiente',
  motivo_rechazo text,
  revisado_por uuid references perfiles (id),
  revisado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_retiros_estado on retiros (estado, created_at desc);
create index if not exists idx_retiros_usuario on retiros (usuario_id, created_at desc);

-- Una sola solicitud pendiente por usuario: evita que alguien fragmente su
-- saldo en decenas de pedidos y llene la cola del staff.
create unique index if not exists idx_retiros_uno_pendiente
  on retiros (usuario_id)
  where estado = 'pendiente';

alter table retiros enable row level security;

-- Solo lectura para el cliente. No hay policy de insert a propósito: crear
-- un retiro tiene que retener saldo al mismo tiempo, y eso solo lo puede
-- hacer el RPC de abajo (security definer, fuera de RLS).
drop policy if exists retiros_select_own on retiros;
create policy retiros_select_own on retiros
  for select using (auth.uid() = usuario_id or es_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- solicitar_retiro
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
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0090';
  end if;
  p_monto := round(p_monto, 2);
  if p_monto < 10 then
    raise exception 'El retiro mínimo es S/10' using errcode = 'P0091';
  end if;

  -- Bloquea la fila para que dos solicitudes simultáneas no puedan
  -- retirar el mismo saldo.
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

-- ---------------------------------------------------------------------------
-- admin_resolver_retiro
--
-- Pagar saca el monto del sistema (baja `saldo_retenido` y no vuelve a
-- `saldo_disponible`). Rechazar lo devuelve. En ambos casos el saldo
-- retenido baja exactamente lo mismo que subió al solicitar.
-- ---------------------------------------------------------------------------

create or replace function admin_resolver_retiro(
  p_admin_id uuid,
  p_retiro_id uuid,
  p_pagar boolean,
  p_motivo text default null
)
returns retiros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retiro retiros%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede resolver retiros' using errcode = 'P0097';
  end if;

  select * into v_retiro from retiros where id = p_retiro_id for update;
  if not found then
    raise exception 'Retiro no encontrado' using errcode = 'P0098';
  end if;
  if v_retiro.estado <> 'pendiente' then
    raise exception 'Este retiro ya fue revisado' using errcode = 'P0099';
  end if;

  if p_pagar then
    -- El dinero sale de la plataforma: baja el retenido y no reaparece.
    update perfiles
      set saldo_retenido = saldo_retenido - v_retiro.monto
      where id = v_retiro.usuario_id;

    insert into movimientos_saldo (usuario_id, tipo, monto)
    values (v_retiro.usuario_id, 'retiro', v_retiro.monto);

    update retiros
      set estado = 'pagado', revisado_por = p_admin_id, revisado_at = now()
      where id = p_retiro_id
      returning * into v_retiro;
  else
    update perfiles
      set saldo_retenido = saldo_retenido - v_retiro.monto,
          saldo_disponible = saldo_disponible + v_retiro.monto
      where id = v_retiro.usuario_id;

    insert into movimientos_saldo (usuario_id, tipo, monto)
    values (v_retiro.usuario_id, 'devolucion', v_retiro.monto);

    update retiros
      set estado = 'rechazado',
          motivo_rechazo = p_motivo,
          revisado_por = p_admin_id,
          revisado_at = now()
      where id = p_retiro_id
      returning * into v_retiro;
  end if;

  return v_retiro;
end;
$$;

revoke all on function admin_resolver_retiro(uuid, uuid, boolean, text) from public;
grant execute on function admin_resolver_retiro(uuid, uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- admin_metricas: se agrega `retirado_hoy`. Cambiar las columnas de un
-- `returns table` cambia la firma, así que hay que soltar la función antes
-- de recrearla (create or replace no alcanza).
-- ---------------------------------------------------------------------------

drop function if exists admin_metricas(uuid);

create or replace function admin_metricas(p_admin_id uuid)
returns table (
  depositado_hoy numeric,
  retirado_hoy numeric,
  pagado_hoy numeric,
  ganancia_hoy numeric,
  ganancia_total numeric,
  usuarios_total bigint,
  usuarios_baneados bigint,
  eventos_abiertos bigint,
  retiros_pendientes bigint
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
      select sum(t.monto) from retiros t
      where t.estado = 'pagado' and t.revisado_at >= date_trunc('day', now())
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
    (select count(*) from eventos where estado = 'abierto'),
    (select count(*) from retiros where estado = 'pendiente');
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;
