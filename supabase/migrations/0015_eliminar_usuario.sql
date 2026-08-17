-- =============================================================================
-- LA PANCA — Eliminar cuenta de usuario
-- 0015_eliminar_usuario.sql: borrado duro de una cuenta, con guardas.
--
-- Esto NO es lo mismo que suspender (`admin_banear_usuario`): suspender
-- conserva saldo e historial y solo bloquea apostar; esto borra la fila de
-- `perfiles` para siempre. Por eso se bloquea si el usuario tiene cualquier
-- rastro que se perdería (apuestas, saldo) — para esos casos el admin debe
-- suspender, no eliminar. El caso pensado es el de una cuenta rota o
-- duplicada recién creada que nunca llegó a jugar.
--
-- `apuestas` y `movimientos_saldo` referencian `perfiles(id)` SIN
-- on delete cascade (a propósito, para no perder auditoría de dinero por
-- accidente) — por eso hace falta esta función en vez de un DELETE directo
-- desde el cliente. `recargas`, `solicitudes_telefono` y `retiros` sí
-- cascadean desde `perfiles`, así que no hace falta tocarlas acá.
--
-- El borrado de la cuenta de Auth (`auth.users`) se hace aparte, con el
-- cliente admin de Supabase Auth desde la Server Action — cascadea de
-- auth.users hacia perfiles, no al revés, así que si se llamara antes de
-- limpiar apuestas/movimientos la cascada fallaría por la misma FK.
-- =============================================================================

create or replace function admin_eliminar_usuario(p_admin_id uuid, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede eliminar usuarios' using errcode = 'P0120';
  end if;

  if p_admin_id = p_usuario_id then
    raise exception 'No puedes eliminar tu propia cuenta' using errcode = 'P0121';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0122';
  end if;

  if v_perfil.rol = 'admin' then
    raise exception 'No se puede eliminar una cuenta de administrador' using errcode = 'P0123';
  end if;

  if v_perfil.saldo_disponible > 0 or v_perfil.saldo_retenido > 0 then
    raise exception 'El usuario tiene saldo pendiente; usa "Suspender" en vez de eliminar' using errcode = 'P0124';
  end if;

  if exists (select 1 from apuestas where usuario_id = p_usuario_id) then
    raise exception 'El usuario tiene historial de apuestas; usa "Suspender" en vez de eliminar' using errcode = 'P0125';
  end if;

  delete from perfiles where id = p_usuario_id;
end;
$$;

revoke all on function admin_eliminar_usuario(uuid, uuid) from public;
grant execute on function admin_eliminar_usuario(uuid, uuid) to service_role;
