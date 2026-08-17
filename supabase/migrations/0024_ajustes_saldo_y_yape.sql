-- =============================================================================
-- LA PANCA — Ajustar saldo de un jugador + corrección manual de Yape
-- 0024_ajustes_saldo_y_yape.sql
--
-- Motivo: no existe ninguna UI para `admin_creditar_saldo` (0005) — la
-- única forma de darle saldo a alguien hoy es aprobar una "recarga", real
-- o no. Si se aprueba una recarga de prueba (plata que nunca entró de
-- verdad por Yape), `recargas_aprobadas` queda inflado y con él
-- `yape_esperado` (0022) — el dashboard promete más plata real de la que
-- hay en el teléfono. Esto agrega dos herramientas para corregir eso:
--
-- 1. admin_ajustar_saldo: corrige el saldo_disponible de un jugador a
--    mano (ej. deshacer el saldo de prueba que le diste a un amigo). Dos
--    consecuencias que hay que aceptar de una vez, no dos veces:
--      - No mueve saldo_retenido: si el jugador tiene una apuesta viva,
--        eso no se toca acá.
--      - No corrige `yape_esperado` solo. yape_esperado se calcula de
--        recargas/retiros/pagos_manuales, no de saldos — así que bajarle
--        el saldo al amigo no arregla el número que ya quedó mal por la
--        recarga de prueba que se aprobó. Para eso está la herramienta 2.
--    Se audita en `ajustes_saldo` con motivo y el saldo antes/después —
--    no en `movimientos_saldo`: esa tabla registra movimientos del motor
--    de apuestas (retención, pago, devolución…), esto es una corrección
--    administrativa aparte, con contexto que `movimientos_saldo` no tiene
--    dónde guardar (no tiene columna de motivo).
--
-- 2. admin_registrar_ajuste_yape: una línea +/- con motivo que se suma a
--    `yape_esperado` para que el número del dashboard vuelva a coincidir
--    con lo que hay de verdad en el teléfono (ej. "-50, recarga de prueba
--    aprobada por error el 17/08"). No mueve saldo de nadie — es solo una
--    corrección de reporte, la misma idea que `pagos_manuales` (0022) pero
--    para el otro lado de la cuenta y con signo libre.
-- =============================================================================

create table if not exists ajustes_saldo (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references perfiles (id),
  usuario_id uuid not null references perfiles (id),
  saldo_anterior numeric(12, 2) not null,
  saldo_nuevo numeric(12, 2) not null,
  motivo text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ajustes_saldo_usuario on ajustes_saldo (usuario_id, created_at desc);

alter table ajustes_saldo enable row level security;

drop policy if exists ajustes_saldo_select on ajustes_saldo;
create policy ajustes_saldo_select
  on ajustes_saldo
  for select using (auth.uid() = usuario_id or es_admin(auth.uid()));

create or replace function admin_ajustar_saldo(
  p_admin_id uuid,
  p_usuario_id uuid,
  p_nuevo_saldo numeric,
  p_motivo text
)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
  v_anterior numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede ajustar saldo' using errcode = 'P0150';
  end if;
  if p_nuevo_saldo is null or p_nuevo_saldo < 0 then
    raise exception 'El saldo no puede ser negativo' using errcode = 'P0151';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Indica el motivo del ajuste' using errcode = 'P0152';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0153';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no tiene saldo de juego' using errcode = 'P0154';
  end if;

  v_anterior := v_perfil.saldo_disponible;

  update perfiles
    set saldo_disponible = round(p_nuevo_saldo, 2)
    where id = p_usuario_id
    returning * into v_perfil;

  insert into ajustes_saldo (admin_id, usuario_id, saldo_anterior, saldo_nuevo, motivo)
  values (p_admin_id, p_usuario_id, v_anterior, round(p_nuevo_saldo, 2), trim(p_motivo));

  return v_perfil;
end;
$$;

revoke all on function admin_ajustar_saldo(uuid, uuid, numeric, text) from public;
grant execute on function admin_ajustar_saldo(uuid, uuid, numeric, text) to service_role;

create table if not exists ajustes_yape (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references perfiles (id),
  monto numeric(12, 2) not null check (monto <> 0),
  motivo text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ajustes_yape_created on ajustes_yape (created_at desc);

alter table ajustes_yape enable row level security;

drop policy if exists ajustes_yape_select_admin on ajustes_yape;
create policy ajustes_yape_select_admin
  on ajustes_yape
  for select using (es_admin(auth.uid()));

create or replace function admin_registrar_ajuste_yape(
  p_admin_id uuid,
  p_monto numeric,
  p_motivo text
)
returns ajustes_yape
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ajuste ajustes_yape%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede registrar ajustes' using errcode = 'P0160';
  end if;
  if p_monto is null or p_monto = 0 then
    raise exception 'El monto debe ser distinto de 0' using errcode = 'P0161';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Indica el motivo del ajuste' using errcode = 'P0162';
  end if;

  insert into ajustes_yape (admin_id, monto, motivo)
  values (p_admin_id, round(p_monto, 2), trim(p_motivo))
  returning * into v_ajuste;

  return v_ajuste;
end;
$$;

revoke all on function admin_registrar_ajuste_yape(uuid, numeric, text) from public;
grant execute on function admin_registrar_ajuste_yape(uuid, numeric, text) to service_role;

-- ---------------------------------------------------------------------------
-- admin_metricas: se agrega ajustes_yape_total y se suma a yape_esperado.
-- Cambia la firma, así que hay que soltar la función antes de recrearla.
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
  retiros_pendientes bigint,
  saldos_usuarios_total numeric,
  pagos_manuales_total numeric,
  ajustes_yape_total numeric,
  yape_esperado numeric
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
    (select count(*) from retiros where estado = 'pendiente'),
    coalesce((
      select sum(saldo_disponible + saldo_retenido) from perfiles where rol = 'user'
    ), 0)::numeric,
    coalesce((select sum(monto) from pagos_manuales), 0)::numeric,
    coalesce((select sum(monto) from ajustes_yape), 0)::numeric,
    (
      coalesce((select sum(monto_acreditado) from recargas where estado = 'aprobada'), 0)
      - coalesce((select sum(monto) from retiros where estado = 'pagado'), 0)
      - coalesce((select sum(monto) from pagos_manuales), 0)
      + coalesce((select sum(monto) from ajustes_yape), 0)
    )::numeric;
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;
