-- =============================================================================
-- LA PANCA — Utilidad de pruebas
-- 0014_borrar_recargas_pruebas.sql: vaciar la tabla de recargas.
--
-- Sirve para repetir el flujo de recarga sin acumular basura de prueba.
-- `recargas` no tiene policy de DELETE (RLS lo niega por defecto), así que
-- el borrado tiene que pasar por acá.
--
-- OJO: borrar una recarga aprobada NO deshace el saldo que acreditó. Eso
-- es deliberado — al testear conviene conservar el saldo para seguir
-- probando apuestas — pero significa que después de usar esto el saldo de
-- un jugador puede no tener recargas que lo expliquen. No es una operación
-- para producción; la UI solo la muestra en desarrollo.
-- =============================================================================

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

  with borradas as (delete from recargas returning 1)
  select count(*) into v_borradas from borradas;

  return v_borradas;
end;
$$;

revoke all on function admin_borrar_recargas(uuid) from public;
grant execute on function admin_borrar_recargas(uuid) to service_role;
