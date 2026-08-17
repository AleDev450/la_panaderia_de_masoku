-- =============================================================================
-- LA PANCA — Corregir el monto de una recarga ya aprobada
-- 0025_corregir_monto_recarga.sql
--
-- `admin_resolver_recarga` (0009) solo actúa una vez, mientras la recarga
-- está 'pendiente' — no hay forma de arreglar una que ya se aprobó con un
-- monto que resultó ser falso o inflado (ej. saldo de prueba que se
-- acreditó como si fuera un depósito real). Esto agrega esa segunda
-- pasada, con dos efectos que van juntos en la misma transacción:
--
--   1. Ajusta `perfiles.saldo_disponible` por la diferencia (nuevo −
--      anterior). Si el jugador ya no tiene suficiente disponible para
--      absorber una reducción (porque ya apostó o retiró esa plata), se
--      rechaza con un mensaje claro en vez de dejar el saldo en negativo.
--   2. Actualiza `recargas.monto_acreditado`. Como `admin_metricas`
--      calcula `yape_esperado` sumando directo de `recargas` con
--      estado='aprobada' (ver 0022/0024), corregir acá el monto de la
--      recarga corrige ese número automáticamente — no hace falta
--      además un ajuste manual de Yape para este caso.
--
-- No se puede bajar a 0: `recargas.monto_acreditado` exige > 0 (mismo
-- check que usa `admin_resolver_recarga` al aprobar). Una recarga
-- 100% falsa no se "corrige a cero" acá — para ese caso extremo, usar
-- "Ajustar saldo" (0024) para el saldo del jugador.
--
-- Se audita en `correcciones_recarga` con el motivo y el monto
-- anterior/nuevo — mismo patrón que `ajustes_saldo` (0024): esa
-- información no tiene dónde guardarse en la tabla `recargas` misma.
-- =============================================================================

create table if not exists correcciones_recarga (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references perfiles (id),
  recarga_id uuid not null references recargas (id),
  monto_anterior numeric(12, 2) not null,
  monto_nuevo numeric(12, 2) not null,
  motivo text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_correcciones_recarga_recarga
  on correcciones_recarga (recarga_id, created_at desc);

alter table correcciones_recarga enable row level security;

drop policy if exists correcciones_recarga_select_admin on correcciones_recarga;
create policy correcciones_recarga_select_admin
  on correcciones_recarga
  for select using (es_admin(auth.uid()));

create or replace function admin_corregir_monto_recarga(
  p_admin_id uuid,
  p_recarga_id uuid,
  p_monto_nuevo numeric,
  p_motivo text
)
returns recargas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recarga recargas%rowtype;
  v_perfil perfiles%rowtype;
  v_anterior numeric(12, 2);
  v_delta numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede corregir recargas' using errcode = 'P0170';
  end if;
  if p_monto_nuevo is null or p_monto_nuevo <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0171';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Indica el motivo de la corrección' using errcode = 'P0172';
  end if;

  select * into v_recarga from recargas where id = p_recarga_id for update;
  if not found then
    raise exception 'Recarga no encontrada' using errcode = 'P0173';
  end if;
  if v_recarga.estado <> 'aprobada' then
    raise exception 'Solo se puede corregir una recarga aprobada' using errcode = 'P0174';
  end if;

  p_monto_nuevo := round(p_monto_nuevo, 2);
  v_anterior := v_recarga.monto_acreditado;
  v_delta := p_monto_nuevo - v_anterior;

  select * into v_perfil from perfiles where id = v_recarga.usuario_id for update;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0175';
  end if;
  if v_perfil.saldo_disponible + v_delta < 0 then
    raise exception 'El jugador ya no tiene suficiente saldo disponible para esta corrección — le faltan S/%',
      round(abs(v_perfil.saldo_disponible + v_delta), 2)
      using errcode = 'P0176';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible + v_delta
    where id = v_recarga.usuario_id;

  update recargas
    set monto_acreditado = p_monto_nuevo
    where id = p_recarga_id
    returning * into v_recarga;

  insert into correcciones_recarga (admin_id, recarga_id, monto_anterior, monto_nuevo, motivo)
  values (p_admin_id, p_recarga_id, v_anterior, p_monto_nuevo, trim(p_motivo));

  return v_recarga;
end;
$$;

revoke all on function admin_corregir_monto_recarga(uuid, uuid, numeric, text) from public;
grant execute on function admin_corregir_monto_recarga(uuid, uuid, numeric, text) to service_role;
