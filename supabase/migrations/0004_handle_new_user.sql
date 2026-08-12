-- =============================================================================
-- LA PANCA — Motor de emparejamiento de apuestas
-- 0004_handle_new_user.sql: crea automáticamente la fila en `perfiles` al
-- registrarse un usuario en Supabase Auth (antes había que insertarla a
-- mano, ver comentarios de 0003_seed.sql). El primer usuario que exista en
-- `perfiles` queda `admin`; todos los siguientes, `user`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- handle_new_user
--
-- Trigger AFTER INSERT en auth.users (tabla gestionada por Supabase Auth,
-- se dispara con signUp/creación desde el dashboard). SECURITY DEFINER
-- porque el usuario recién creado todavía no tiene permisos propios sobre
-- `perfiles` en ese mismo instante.
--
-- Nickname: usa `raw_user_meta_data->>'nickname'` si el signUp lo mandó
-- (`options.data.nickname`), si no cae al prefijo del email; como
-- `perfiles.nickname` es unique, si hay choque se le agrega un sufijo
-- corto tomado del uuid para no romper el registro.
--
-- Rol: 'admin' si `perfiles` está vacía en el momento del insert (o sea,
-- eres la primera cuenta), 'user' en cualquier otro caso. Pensado para
-- bootstrap de demo/desarrollo, no para producción con alta concurrencia
-- de registros simultáneos — ahí conviene promover admins a mano (ver
-- 0003_seed.sql) en vez de depender de "quién llegó primero".
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
  v_rol text;
begin
  v_nickname := coalesce(
    new.raw_user_meta_data ->> 'nickname',
    split_part(new.email, '@', 1)
  );

  if exists (select 1 from perfiles where nickname = v_nickname) then
    v_nickname := v_nickname || '_' || substr(new.id::text, 1, 6);
  end if;

  v_rol := case when not exists (select 1 from perfiles) then 'admin' else 'user' end;

  insert into perfiles (id, nickname, rol)
  values (new.id, v_nickname, v_rol);

  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;

create trigger trg_handle_new_user
  after insert on auth.users
  for each row
  execute function handle_new_user();
