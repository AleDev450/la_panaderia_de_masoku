-- =============================================================================
-- LA PANCA — Endurecer recargas + rate limiting (fix hallazgos #1 y #2)
-- 0031_endurecer_recargas_y_rate_limit.sql
--
-- CONTEXTO: la app asume que toda escritura pasa por las Server Actions
-- (que validan con zod). Pero la policy RLS `recargas_insert_own` (0011)
-- deja que un usuario autenticado inserte DIRECTO en /rest/v1/recargas con
-- la anon key, saltándose zod por completo. A nivel de base el único freno
-- era `monto_solicitado > 0` y `comprobante` es `text` sin tope — o sea:
--   - un `comprobante` de 500 MB de basura → infla Postgres (DoS).
--   - `monto_solicitado = 999999` → ensucia la cola del admin.
--   - miles de filas pendientes → misma DoS por volumen.
--
-- 1. RECARGAS: se llevan las reglas de zod a la base (CHECK + policy), así
--    valen por CUALQUIER camino, no solo por la Server Action. Los CHECK
--    van `not valid`: aplican a filas NUEVAS sin escanear el histórico (que
--    ya cumple), para que la migración no falle por datos viejos.
--
-- 2. RATE LIMIT: tabla + función `rate_limit_check` para poner topes por IP
--    (registro) y por usuario (recargas) desde las Server Actions. Sin esto
--    un script crea miles de cuentas o inunda la cola sin fricción.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1a. RECARGAS: monto y comprobante acotados a nivel de base.
--     `drop ... if exists` antes de cada add para que la migración se pueda
--     re-ejecutar (Postgres no tiene `add constraint if not exists`).
-- ---------------------------------------------------------------------------

alter table recargas drop constraint if exists recargas_monto_solicitado_rango;
alter table recargas
  add constraint recargas_monto_solicitado_rango
    -- Debe coincidir con MONTO_MIN/MONTO_MAX de src/lib/recargas.ts.
    check (monto_solicitado >= 10 and monto_solicitado <= 100) not valid;

alter table recargas drop constraint if exists recargas_comprobante_valido;
alter table recargas
  add constraint recargas_comprobante_valido
    -- Data URL de imagen (mismo prefijo que exige zod) y tope de tamaño:
    -- una foto comprimida a 1000px/JPEG ronda los 100–500 KB en base64, así
    -- que 4 MB es holgado para lo legítimo y corta el abuso.
    check (comprobante like 'data:image/%' and char_length(comprobante) <= 4000000) not valid;

-- ---------------------------------------------------------------------------
-- 1b. RECARGAS: tope de pendientes por usuario, dentro de la policy de
--     insert. Se cuenta con una función `security definer` (salta RLS) en
--     vez de una subconsulta a la misma tabla dentro de la policy, para no
--     depender de cómo RLS se aplica a subconsultas de la propia tabla.
-- ---------------------------------------------------------------------------

create or replace function tiene_cupo_recarga(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < 5 from recargas
  where usuario_id = p_usuario and estado = 'pendiente';
$$;

drop policy if exists recargas_insert_own on recargas;
create policy recargas_insert_own on recargas
  for insert with check (
    auth.uid() = usuario_id
    and estado = 'pendiente'
    and monto_acreditado is null
    and revisado_por is null
    and revisado_at is null
    and tiene_cupo_recarga(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 1c. SOLICITUDES DE TELÉFONO: ya hay índice de "una pendiente" (0008), pero
--     `telefono_nuevo` y `motivo` eran text sin tope. Se acotan igual.
-- ---------------------------------------------------------------------------

alter table solicitudes_telefono drop constraint if exists solicitudes_telefono_nuevo_valido;
alter table solicitudes_telefono
  add constraint solicitudes_telefono_nuevo_valido
    check (telefono_nuevo ~ '^\d{9}$') not valid;

alter table solicitudes_telefono drop constraint if exists solicitudes_telefono_motivo_largo;
alter table solicitudes_telefono
  add constraint solicitudes_telefono_motivo_largo
    check (motivo is null or char_length(motivo) <= 300) not valid;

-- ---------------------------------------------------------------------------
-- 2. RATE LIMIT: ventana fija por clave. El upsert es atómico (una sola
--    sentencia, la fila se bloquea en el `on conflict`), así que dos
--    llamadas simultáneas cuentan bien. Devuelve true si la acción está
--    permitida, false si ya se pasó del tope en la ventana.
--
--    La ventana se pasa en SEGUNDOS (int) y no como `interval` para evitar
--    ambigüedades de casteo text→interval al llamar por PostgREST.
-- ---------------------------------------------------------------------------

create table if not exists rate_limits (
  clave text primary key,
  ventana_inicio timestamptz not null default now(),
  contador integer not null default 0
);

-- Sin policies: solo la función (security definer) y service_role la tocan;
-- ningún cliente puede leer ni escribir esta tabla directamente.
alter table rate_limits enable row level security;

create or replace function rate_limit_check(
  p_clave text,
  p_max integer,
  p_ventana_segundos integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contador integer;
begin
  insert into rate_limits (clave, ventana_inicio, contador)
  values (p_clave, now(), 1)
  on conflict (clave) do update
    set contador = case
          when rate_limits.ventana_inicio < now() - make_interval(secs => p_ventana_segundos)
            then 1
          else rate_limits.contador + 1
        end,
        ventana_inicio = case
          when rate_limits.ventana_inicio < now() - make_interval(secs => p_ventana_segundos)
            then now()
          else rate_limits.ventana_inicio
        end
  returning contador into v_contador;

  return v_contador <= p_max;
end;
$$;

revoke all on function rate_limit_check(text, integer, integer) from public;
grant execute on function rate_limit_check(text, integer, integer) to service_role;
