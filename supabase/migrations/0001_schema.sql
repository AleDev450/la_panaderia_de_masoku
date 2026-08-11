-- =============================================================================
-- LA PANCA — Motor de emparejamiento de apuestas (betting exchange)
-- 0001_schema.sql: enums, tablas, índices, funciones auxiliares y RLS.
--
-- Modelo económico (no tocar sin actualizar también las funciones RPC):
--   - Cuota de pago fija: 1.80
--   - Por cada par de "monto" emparejado (monto de lado A == monto de lado B):
--       pool = 2 * monto
--       payout al ganador = monto * 1.80
--       comisión de plataforma = pool - payout = 0.20 * monto
--   - La plataforma nunca asume riesgo de mercado: su ganancia es fija por
--     volumen emparejado y resuelto, independiente del resultado.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type estado_evento as enum ('abierto', 'cerrado', 'resuelto');
create type lado_apuesta as enum ('a', 'b');
create type estado_apuesta as enum ('pendiente', 'parcial', 'completa', 'cancelada');
create type tipo_movimiento_saldo as enum ('retencion', 'devolucion', 'pago_ganancia', 'cancelacion');

-- ---------------------------------------------------------------------------
-- Perfiles (extiende auth.users de Supabase)
-- ---------------------------------------------------------------------------

create table perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null unique,
  rol text not null default 'user' check (rol in ('user', 'admin')),
  saldo_disponible numeric(12, 2) not null default 0 check (saldo_disponible >= 0),
  saldo_retenido numeric(12, 2) not null default 0 check (saldo_retenido >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table perfiles is 'Perfil de usuario y billetera interna (saldo disponible / retenido). No representa dinero real.';

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------

create table eventos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  lado_a text not null,
  lado_b text not null,
  estado estado_evento not null default 'abierto',
  resultado lado_apuesta,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resultado_solo_si_resuelto check (
    (estado = 'resuelto' and resultado is not null) or
    (estado <> 'resuelto' and resultado is null)
  )
);

-- ---------------------------------------------------------------------------
-- Apuestas
-- ---------------------------------------------------------------------------

create table apuestas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id),
  usuario_id uuid not null references perfiles (id),
  lado lado_apuesta not null,
  monto_total numeric(12, 2) not null check (monto_total > 0),
  monto_matcheado numeric(12, 2) not null default 0 check (monto_matcheado >= 0),
  monto_pendiente numeric(12, 2) not null check (monto_pendiente >= 0),
  estado estado_apuesta not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monto_coherente check (monto_matcheado + monto_pendiente <= monto_total)
);

-- Índice compuesto para el matching FIFO: buscar órdenes pendientes/parciales
-- del lado contrario en un evento, ordenadas por antigüedad.
create index idx_apuestas_matching
  on apuestas (evento_id, lado, estado, created_at)
  where estado in ('pendiente', 'parcial');

create index idx_apuestas_usuario on apuestas (usuario_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Emparejamientos (auditoría de cada match FIFO realizado)
-- ---------------------------------------------------------------------------

create table emparejamientos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id),
  apuesta_a_id uuid not null references apuestas (id),
  apuesta_b_id uuid not null references apuestas (id),
  monto numeric(12, 2) not null check (monto > 0),
  created_at timestamptz not null default now(),
  constraint lados_distintos check (apuesta_a_id <> apuesta_b_id)
);

create index idx_emparejamientos_evento on emparejamientos (evento_id);
create index idx_emparejamientos_apuesta_a on emparejamientos (apuesta_a_id);
create index idx_emparejamientos_apuesta_b on emparejamientos (apuesta_b_id);

-- ---------------------------------------------------------------------------
-- Movimientos de saldo (auditoría de billetera)
-- ---------------------------------------------------------------------------

create table movimientos_saldo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id),
  tipo tipo_movimiento_saldo not null,
  monto numeric(12, 2) not null check (monto >= 0),
  apuesta_id uuid references apuestas (id),
  evento_id uuid references eventos (id),
  created_at timestamptz not null default now()
);

create index idx_movimientos_usuario on movimientos_saldo (usuario_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Comisiones de la plataforma (ganancia garantizada por evento resuelto)
-- ---------------------------------------------------------------------------

create table comisiones_plataforma (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null unique references eventos (id),
  monto numeric(12, 2) not null check (monto >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper: ¿es administrador?
-- ---------------------------------------------------------------------------

create or replace function es_admin(p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rol = 'admin' from perfiles where id = p_usuario_id),
    false
  );
$$;

-- updated_at automático
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_perfiles_updated_at before update on perfiles
  for each row execute function set_updated_at();
create trigger trg_eventos_updated_at before update on eventos
  for each row execute function set_updated_at();
create trigger trg_apuestas_updated_at before update on apuestas
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table perfiles enable row level security;
alter table eventos enable row level security;
alter table apuestas enable row level security;
alter table emparejamientos enable row level security;
alter table movimientos_saldo enable row level security;
alter table comisiones_plataforma enable row level security;

-- perfiles: cada usuario ve y crea solo su propio perfil. El saldo solo se
-- modifica desde las funciones RPC (security definer), nunca por UPDATE
-- directo del cliente.
create policy perfiles_select_own on perfiles
  for select using (auth.uid() = id);

create policy perfiles_insert_own on perfiles
  for insert with check (auth.uid() = id);

-- eventos: lectura pública para usuarios autenticados (order book visible).
-- Escritura solo para administradores o el service_role del servidor.
create policy eventos_select_authenticated on eventos
  for select using (auth.role() = 'authenticated');

create policy eventos_admin_write on eventos
  for all using (es_admin(auth.uid())) with check (es_admin(auth.uid()));

-- apuestas: cada usuario ve solo sus propias apuestas. No hay policies de
-- insert/update/delete para el cliente: toda mutación pasa por crear_apuesta
-- / cancelar_apuesta / resolver_evento (SECURITY DEFINER, bypassa RLS).
create policy apuestas_select_own on apuestas
  for select using (auth.uid() = usuario_id);

-- emparejamientos: visibles para los dueños de cualquiera de las dos apuestas.
create policy emparejamientos_select_involved on emparejamientos
  for select using (
    exists (
      select 1 from apuestas
      where apuestas.id in (emparejamientos.apuesta_a_id, emparejamientos.apuesta_b_id)
        and apuestas.usuario_id = auth.uid()
    )
  );

-- movimientos_saldo: cada usuario ve solo su propio historial.
create policy movimientos_select_own on movimientos_saldo
  for select using (auth.uid() = usuario_id);

-- comisiones_plataforma: solo administradores.
create policy comisiones_admin_select on comisiones_plataforma
  for select using (es_admin(auth.uid()));
