-- =============================================================================
-- LA PANCA — Pagos manuales (retiros propios / pagos a trabajadores)
-- 0022_pagos_manuales.sql
--
-- `retiros` es dinero que un JUGADOR pide y el staff yapea. Esto es lo
-- contrario: dinero que el ADMIN saca del Yape de la plataforma por fuera
-- del juego — para sí mismo o para pagar a trabajadores. No mueve saldo de
-- ningún usuario (no es apuesta ni retiro de jugador); es solo un
-- registro contable de que ese dinero salió del Yape, para poder
-- reconstruir cuánto debería haber ahí en cualquier momento.
--
-- Identidad contable: todo sol que entra por una recarga aprobada, o se
-- queda en el saldo de algún jugador (`saldo_disponible + saldo_retenido`),
-- o se convirtió en comisión de la plataforma (`ganancia_total`), o salió
-- pagado a un jugador (`retiros` pagados). Por eso:
--
--   yape_esperado = recargas_aprobadas − retiros_pagados − pagos_manuales
--                  = ganancia_total + saldos_de_jugadores − pagos_manuales
--
-- Ambas fórmulas dan lo mismo; `admin_metricas` calcula la primera
-- directamente de las tablas de movimiento (más robusto que confiar en que
-- el saldo de cada perfil nunca se desincronizó) y expone también sus dos
-- piezas (`ganancia_total`, `saldos_usuarios_total`) para que el mensaje
-- en el dashboard pueda mostrar el desglose.
-- =============================================================================

create table if not exists pagos_manuales (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references perfiles (id),
  concepto text not null,
  monto numeric(12, 2) not null check (monto > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_pagos_manuales_created on pagos_manuales (created_at desc);

alter table pagos_manuales enable row level security;

drop policy if exists pagos_manuales_select_admin on pagos_manuales;
create policy pagos_manuales_select_admin
  on pagos_manuales
  for select using (es_admin(auth.uid()));

-- Sin policy de insert/update/delete: RLS lo niega por defecto. El único
-- camino para crear un registro es el RPC de abajo (service_role), igual
-- que el resto de tablas sensibles de este esquema.

create or replace function admin_registrar_pago_manual(
  p_admin_id uuid,
  p_concepto text,
  p_monto numeric
)
returns pagos_manuales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos_manuales%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede registrar pagos' using errcode = 'P0140';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0141';
  end if;
  if p_concepto is null or trim(p_concepto) = '' then
    raise exception 'Indica a quién o para qué se pagó' using errcode = 'P0142';
  end if;

  insert into pagos_manuales (admin_id, concepto, monto)
  values (p_admin_id, trim(p_concepto), round(p_monto, 2))
  returning * into v_pago;

  return v_pago;
end;
$$;

revoke all on function admin_registrar_pago_manual(uuid, text, numeric) from public;
grant execute on function admin_registrar_pago_manual(uuid, text, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- admin_metricas: se agregan saldos_usuarios_total, pagos_manuales_total
-- y yape_esperado. Cambia la firma (returns table), así que hay que soltar
-- la función antes de recrearla — igual que hizo 0012 con retirado_hoy.
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
    (
      coalesce((select sum(monto_acreditado) from recargas where estado = 'aprobada'), 0)
      - coalesce((select sum(monto) from retiros where estado = 'pagado'), 0)
      - coalesce((select sum(monto) from pagos_manuales), 0)
    )::numeric;
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;
