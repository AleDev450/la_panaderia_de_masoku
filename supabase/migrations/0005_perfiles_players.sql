-- =============================================================================
-- LA PANCA — Motor de emparejamiento de apuestas
-- 0005_perfiles_players.sql: extiende `perfiles` para soportar también el
-- registro/login de jugadores del demo 1:1 (antes mock en localStorage,
-- ahora Supabase Auth real vía src/services/userService.ts), agrega los
-- RPC admin_creditar_saldo / admin_otorgar_puntos que usan las pantallas
-- de /bakery (recargas y resolución de títulos), y corrige el trigger
-- `handle_new_user` de 0004 para que ya no dependa de "quién se registró
-- primero" ahora que el registro es público.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Columnas nuevas para el demo 1:1 (el motor /exchange no las usa).
-- ---------------------------------------------------------------------------

alter table perfiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists puntos integer not null default 0;

create unique index if not exists perfiles_phone_key
  on perfiles (phone)
  where phone is not null;

-- ---------------------------------------------------------------------------
-- handle_new_user: ya no marca admin al primer registro — con el registro
-- de jugadores abierto al público, "el primero en llegar" es un vector de
-- privilegio, no una regla de negocio. Todo signup nuevo entra como
-- 'user'; promover a admin sigue siendo manual (ver 0003_seed.sql).
-- También guarda full_name/phone si el signUp los mandó en
-- options.data (ver registerUser en userService.ts).
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
begin
  v_nickname := coalesce(
    new.raw_user_meta_data ->> 'nickname',
    split_part(new.email, '@', 1)
  );

  if exists (select 1 from perfiles where nickname = v_nickname) then
    v_nickname := v_nickname || '_' || substr(new.id::text, 1, 6);
  end if;

  insert into perfiles (id, nickname, rol, full_name, phone)
  values (
    new.id,
    v_nickname,
    'user',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  );

  return new;
end;
$$;

-- (el trigger trg_handle_new_user en auth.users ya existe desde 0004; esta
-- migración solo reemplaza el cuerpo de la función que invoca)

-- ---------------------------------------------------------------------------
-- RLS: con el trigger creando la fila, el cliente ya no necesita insertarse
-- su propio perfil — eliminar ese insert cierra la vía por la que un
-- cliente autenticado podía insertar su fila con rol='admin' a mano
-- (el insert with check solo validaba auth.uid() = id, no el rol).
-- select_own se reemplaza por select_authenticated: /ranking necesita leer
-- nickname + puntos de todos los jugadores, no solo el propio perfil.
-- ---------------------------------------------------------------------------

drop policy if exists perfiles_insert_own on perfiles;
drop policy if exists perfiles_select_own on perfiles;

create policy perfiles_select_authenticated on perfiles
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- admin_creditar_saldo / admin_otorgar_puntos (solo admin)
--
-- Mutan el saldo/puntos de OTRO usuario (un jugador), así que no pueden
-- resolverse con una policy RLS de "cada quien su fila" — igual que
-- resolver_evento, reciben p_admin_id explícito y se restringen a
-- service_role: el servidor Next.js resuelve la sesión real desde la
-- cookie (ver requireSessionUserId en src/actions/betting.ts) antes de
-- invocarlas, así que confiar en el parámetro está justificado solo ahí.
-- ---------------------------------------------------------------------------

create or replace function admin_creditar_saldo(
  p_admin_id uuid,
  p_usuario_id uuid,
  p_monto numeric
)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede acreditar saldo' using errcode = 'P0030';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0031';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible + round(p_monto, 2)
    where id = p_usuario_id
    returning * into v_perfil;

  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0032';
  end if;

  return v_perfil;
end;
$$;

revoke all on function admin_creditar_saldo(uuid, uuid, numeric) from public;
grant execute on function admin_creditar_saldo(uuid, uuid, numeric) to service_role;

create or replace function admin_otorgar_puntos(
  p_admin_id uuid,
  p_usuario_id uuid,
  p_puntos integer
)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede otorgar puntos' using errcode = 'P0033';
  end if;
  if p_puntos is null or p_puntos <= 0 then
    raise exception 'Los puntos deben ser mayores a 0' using errcode = 'P0034';
  end if;

  update perfiles
    set puntos = puntos + p_puntos
    where id = p_usuario_id
    returning * into v_perfil;

  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0035';
  end if;

  return v_perfil;
end;
$$;

revoke all on function admin_otorgar_puntos(uuid, uuid, integer) from public;
grant execute on function admin_otorgar_puntos(uuid, uuid, integer) to service_role;
