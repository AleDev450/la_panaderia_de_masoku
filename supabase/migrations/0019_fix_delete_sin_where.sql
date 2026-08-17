-- =============================================================================
-- LA PANCA — Fix: "DELETE requires a WHERE clause"
-- 0019_fix_delete_sin_where.sql
--
-- Supabase corre las funciones `security definer` con el guard de
-- `safeupdate` activo para el rol dueño de la función, que rechaza
-- cualquier DELETE/UPDATE sin WHERE — incluso cuando el DELETE es
-- intencionalmente "toda la tabla". `admin_resetear_plataforma` (0017) y
-- `admin_borrar_recargas` (0014) tenían varios `delete from x;` a secas y
-- fallaban con "DELETE requires a WHERE clause" al ejecutarse.
--
-- El arreglo es agregar `where true` — sigue borrando todo, pero ya trae
-- la cláusula que el guard exige. Se repiten las funciones enteras porque
-- `create or replace` reemplaza el cuerpo completo.
-- =============================================================================

create or replace function admin_resetear_plataforma(p_admin_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuarios uuid[];
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede reiniciar la plataforma' using errcode = 'P0130';
  end if;

  select coalesce(array_agg(id), '{}') into v_usuarios from perfiles where rol = 'user';

  delete from emparejamientos where true;
  delete from comisiones_plataforma where true;
  delete from apuestas where true;
  delete from movimientos_saldo where true;
  delete from recargas where true;
  delete from solicitudes_telefono where true;
  delete from retiros where true;
  delete from eventos where true;
  delete from perfiles where rol = 'user';

  return v_usuarios;
end;
$$;

revoke all on function admin_resetear_plataforma(uuid) from public;
grant execute on function admin_resetear_plataforma(uuid) to service_role;

create or replace function admin_borrar_recargas(p_admin_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas integer;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede borrar recargas' using errcode = 'P0120';
  end if;

  with borradas as (delete from recargas where true returning 1)
  select count(*) into v_borradas from borradas;

  return v_borradas;
end;
$$;

revoke all on function admin_borrar_recargas(uuid) from public;
grant execute on function admin_borrar_recargas(uuid) to service_role;
