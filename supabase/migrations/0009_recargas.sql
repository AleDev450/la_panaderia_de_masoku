-- =============================================================================
-- LA PANCA — Recargas de saldo con comprobante
-- 0009_recargas.sql: las recargas pasan de localStorage a Postgres.
--
-- Antes vivían en `localStorage` (src/services/recargaService.ts), lo que
-- hacía el flujo inservible entre usuarios: el jugador guardaba su
-- comprobante en SU navegador y el admin leía el suyo, así que nunca veía
-- las recargas de nadie. Con la tabla acá, el admin ve todas.
--
-- El comprobante se guarda como data URL en una columna `text` (la imagen
-- ya viene comprimida a ~1000px JPEG desde el cliente, ver src/lib/image.ts).
-- Supabase Storage sería lo correcto para producción — bucket + policies +
-- signed URLs —; para este demo el texto en Postgres evita esa superficie
-- extra y TOAST se encarga del tamaño.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_recarga') then
    create type estado_recarga as enum ('pendiente', 'aprobada', 'rechazada');
  end if;
end
$$;

create table if not exists recargas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id) on delete cascade,
  -- Lo que el jugador declaró...
  monto_solicitado numeric(12, 2) not null check (monto_solicitado > 0),
  -- ...y lo que el admin acreditó de verdad tras mirar el comprobante.
  -- Se guardan por separado a propósito: si no coinciden, queda registro.
  monto_acreditado numeric(12, 2) check (monto_acreditado > 0),
  comprobante text not null,
  estado estado_recarga not null default 'pendiente',
  revisado_por uuid references perfiles (id),
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  constraint acreditado_solo_si_aprobada check (
    (estado = 'aprobada' and monto_acreditado is not null) or
    (estado <> 'aprobada' and monto_acreditado is null)
  )
);

create index if not exists idx_recargas_estado on recargas (estado, created_at desc);
create index if not exists idx_recargas_usuario on recargas (usuario_id, created_at desc);

alter table recargas enable row level security;

-- El jugador ve y crea las suyas; el admin ve todas. La aprobación pasa
-- por el RPC de abajo, nunca por un update directo del cliente.
drop policy if exists recargas_select_own on recargas;
create policy recargas_select_own on recargas
  for select using (auth.uid() = usuario_id or es_admin(auth.uid()));

drop policy if exists recargas_insert_own on recargas;
create policy recargas_insert_own on recargas
  for insert with check (auth.uid() = usuario_id);

-- ---------------------------------------------------------------------------
-- admin_resolver_recarga (solo admin)
--
-- Aprobar acredita el saldo y cierra la recarga en una sola transacción —
-- antes eran dos pasos sueltos (marcar aprobada en localStorage + llamar
-- admin_creditar_saldo), y si el segundo fallaba la recarga quedaba
-- aprobada sin dinero acreditado.
--
-- `p_monto_acreditado` permite corregir el monto: el jugador puede
-- declarar S/100 y el comprobante decir S/50. Si llega null, se acredita
-- lo que el jugador declaró.
-- ---------------------------------------------------------------------------

create or replace function admin_resolver_recarga(
  p_admin_id uuid,
  p_recarga_id uuid,
  p_aprobar boolean,
  p_monto_acreditado numeric default null
)
returns recargas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recarga recargas%rowtype;
  v_monto numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede resolver recargas' using errcode = 'P0050';
  end if;

  select * into v_recarga from recargas where id = p_recarga_id for update;
  if not found then
    raise exception 'Recarga no encontrada' using errcode = 'P0051';
  end if;
  if v_recarga.estado <> 'pendiente' then
    raise exception 'Esta recarga ya fue revisada' using errcode = 'P0052';
  end if;

  if p_aprobar then
    v_monto := round(coalesce(p_monto_acreditado, v_recarga.monto_solicitado), 2);
    if v_monto <= 0 then
      raise exception 'El monto a acreditar debe ser mayor a 0' using errcode = 'P0053';
    end if;

    update perfiles
      set saldo_disponible = saldo_disponible + v_monto
      where id = v_recarga.usuario_id;

    update recargas
      set estado = 'aprobada',
          monto_acreditado = v_monto,
          revisado_por = p_admin_id,
          revisado_at = now()
      where id = p_recarga_id
      returning * into v_recarga;
  else
    update recargas
      set estado = 'rechazada',
          revisado_por = p_admin_id,
          revisado_at = now()
      where id = p_recarga_id
      returning * into v_recarga;
  end if;

  return v_recarga;
end;
$$;

revoke all on function admin_resolver_recarga(uuid, uuid, boolean, numeric) from public;
grant execute on function admin_resolver_recarga(uuid, uuid, boolean, numeric) to service_role;
