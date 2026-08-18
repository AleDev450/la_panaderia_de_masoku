-- =============================================================================
-- LA PANCA — Un usuario suspendido no puede seguir mandando recargas
-- 0032_baneado_no_puede_recargar.sql
--
-- INCIDENTE: se baneó una cuenta que atacaba con un script, pero seguía
-- mandando "capturas" (recargas). CAUSA: el insert de recargas (la policy
-- RLS `recargas_insert_own`) nunca miraba `perfiles.baneado` — solo lo
-- hacían crear_apuesta y solicitar_retiro. Un baneado, ya sea por la UI o
-- POSTeando directo a /rest/v1/recargas con su JWT todavía válido, igual
-- entraba.
--
-- FIX: se corta a nivel de base. La policy ahora exige NO estar baneado, así
-- vale por CUALQUIER camino y toma efecto apenas corres esta migración —
-- sin depender de que expire su sesión de Supabase Auth (banear en la app
-- solo prende un flag en `perfiles`, no revoca el token).
--
-- Esta migración es autosuficiente: recrea también `tiene_cupo_recarga`
-- (de 0031) para que la policy sea válida aunque 0031 aún no se haya
-- corrido. `create or replace` es idempotente, así que no rompe nada si
-- 0031 ya está aplicada.
-- =============================================================================

create or replace function esta_baneado(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select baneado from perfiles where id = p_usuario), false);
$$;

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

-- Recargas: además de todo lo de 0011/0031, ahora exige no estar baneado.
drop policy if exists recargas_insert_own on recargas;
create policy recargas_insert_own on recargas
  for insert with check (
    auth.uid() = usuario_id
    and estado = 'pendiente'
    and monto_acreditado is null
    and revisado_por is null
    and revisado_at is null
    and tiene_cupo_recarga(auth.uid())
    and not esta_baneado(auth.uid())
  );

-- Mismo criterio para las solicitudes de cambio de teléfono: un baneado no
-- debería poder seguir llenando ninguna cola del staff.
drop policy if exists solicitudes_telefono_insert_own on solicitudes_telefono;
create policy solicitudes_telefono_insert_own on solicitudes_telefono
  for insert with check (
    auth.uid() = usuario_id
    and estado = 'pendiente'
    and revisado_por is null
    and revisado_at is null
    and not esta_baneado(auth.uid())
  );
