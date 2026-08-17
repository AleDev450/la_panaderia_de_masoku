-- =============================================================================
-- LA PANCA — Utilidad de pruebas: reiniciar la plataforma
-- 0017_resetear_plataforma.sql
--
-- Borra TODO para volver a probar desde cero: usuarios (perfiles con rol
-- 'user'), su historial de apuestas y emparejamientos, sus movimientos de
-- saldo, comisiones ya calculadas, recargas, solicitudes de teléfono,
-- retiros, y los `eventos` (títulos/salas) también — a pedido explícito,
-- para que el reinicio deje la plataforma en un estado 100% limpio y no
-- con salas viejas sin jugadores. Las cuentas 'admin' NO se tocan —
-- reiniciar la plataforma no debería borrar al admin que usa el botón.
--
-- A diferencia de `admin_eliminar_usuario` (0015), esto NO tiene guardas:
-- borra sin importar saldo o historial. Es deliberado — es el botón de
-- "empezar de cero" para pruebas, no una herramienta de moderación — por
-- eso queda detrás del mismo flag `HERRAMIENTAS_PRUEBA` que usa
-- `admin_borrar_recargas` (0014), y la UI exige escribir una confirmación.
--
-- Devuelve los ids de los usuarios borrados: la Server Action los necesita
-- para borrar también sus cuentas de Supabase Auth (perfiles -> auth.users
-- cascadea en un solo sentido, no al revés — ver 0015).
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

  delete from emparejamientos;
  delete from comisiones_plataforma;
  delete from apuestas;
  delete from movimientos_saldo;
  delete from recargas;
  delete from solicitudes_telefono;
  delete from retiros;
  delete from eventos;
  delete from perfiles where rol = 'user';

  return v_usuarios;
end;
$$;

revoke all on function admin_resetear_plataforma(uuid) from public;
grant execute on function admin_resetear_plataforma(uuid) to service_role;
