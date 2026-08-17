-- =============================================================================
-- LA PANCA — Fix: orden de borrado en admin_resetear_plataforma
-- 0020_fix_orden_resetear_plataforma.sql
--
-- 0017 borraba `apuestas` antes que `movimientos_saldo`, pero
-- `movimientos_saldo.apuesta_id` referencia `apuestas(id)` sin cascade —
-- el DELETE de apuestas fallaba con "violates foreign key constraint
-- movimientos_saldo_apuesta_id_fkey". El orden correcto es de hijo a
-- padre: primero lo que referencia una fila, después la fila.
--
--   emparejamientos  -> referencia apuestas
--   movimientos_saldo -> referencia apuestas (y opcionalmente eventos)
--   apuestas          -> referencia eventos
--   comisiones_plataforma -> referencia eventos
--   eventos
--   recargas / solicitudes_telefono / retiros -> referencian perfiles,
--     pero con "on delete cascade", así que en realidad no hace falta
--     borrarlas aparte (perfiles ya las arrastra) — se dejan explícitas
--     para no depender de eso.
--   perfiles (rol = 'user') -> al final, todo lo demás ya la soltó
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
  delete from movimientos_saldo where true;
  delete from apuestas where true;
  delete from comisiones_plataforma where true;
  delete from eventos where true;
  delete from recargas where true;
  delete from solicitudes_telefono where true;
  delete from retiros where true;
  delete from perfiles where rol = 'user';

  return v_usuarios;
end;
$$;

revoke all on function admin_resetear_plataforma(uuid) from public;
grant execute on function admin_resetear_plataforma(uuid) to service_role;
