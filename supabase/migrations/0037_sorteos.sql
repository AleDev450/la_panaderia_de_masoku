-- =============================================================================
-- LA PANCA — Sorteos (cofres Carmesí y lo que venga después)
-- 0037_sorteos.sql
--
-- Un sorteo es una convocatoria abierta: se publica con sus pasos, la gente
-- se inscribe dejando su perfil de Steam (a dónde llega el cofre) y su
-- Discord (por dónde se le avisa), y al final se marca al ganador.
--
-- La inscripción va atada a `usuario_id`, no suelta con un correo:
--   - el índice único (sorteo, usuario) es lo que impide que uno se anote
--     veinte veces con veinte links distintos;
--   - ya tienes su nickname y teléfono para contactarlo si el Discord que
--     puso está mal.
-- El costo de esa decisión es que hay que tener cuenta para participar.
--
-- El link de Steam se guarda tal cual lo pega la persona. Se valida que sea
-- de steamcommunity.com y nada más: Steam tiene varias formas legítimas de
-- perfil (/id/vanity, /profiles/7656…, con o sin barra final) y ser más
-- estricto acá solo consigue rebotar gente con el link correcto.
-- =============================================================================

create table if not exists sorteos (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references perfiles (id),
  nombre text not null,
  premio text not null,
  -- Los pasos de "cómo participar", tal cual se muestran en la página.
  instrucciones text,
  fecha_sorteo date,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sorteos_activo on sorteos (activo, created_at desc);

create table if not exists inscripciones_sorteo (
  id uuid primary key default gen_random_uuid(),
  sorteo_id uuid not null references sorteos (id) on delete cascade,
  usuario_id uuid not null references perfiles (id) on delete cascade,
  discord text not null,
  steam_url text not null,
  ganador boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint una_inscripcion_por_sorteo unique (sorteo_id, usuario_id)
);

create index if not exists idx_inscripciones_sorteo on inscripciones_sorteo (sorteo_id, created_at desc);

drop trigger if exists trg_sorteos_updated_at on sorteos;
create trigger trg_sorteos_updated_at before update on sorteos
  for each row execute function set_updated_at();

drop trigger if exists trg_inscripciones_updated_at on inscripciones_sorteo;
create trigger trg_inscripciones_updated_at before update on inscripciones_sorteo
  for each row execute function set_updated_at();

alter table sorteos enable row level security;
alter table inscripciones_sorteo enable row level security;

-- Los sorteos son el aviso público: cualquiera logueado los ve.
drop policy if exists sorteos_select on sorteos;
create policy sorteos_select
  on sorteos
  for select using (auth.role() = 'authenticated');

drop policy if exists sorteos_admin_write on sorteos;
create policy sorteos_admin_write
  on sorteos
  for all using (es_admin(auth.uid())) with check (es_admin(auth.uid()));

-- Cada uno ve su inscripción; el admin ve la lista completa. Nadie escribe
-- directo: todo pasa por los RPC de abajo.
drop policy if exists inscripciones_select on inscripciones_sorteo;
create policy inscripciones_select
  on inscripciones_sorteo
  for select using (auth.uid() = usuario_id or es_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- inscribirse_sorteo
--
-- Es un upsert a propósito: volver a enviar el formulario corrige el link
-- en vez de rebotar con "ya estás inscrito". Pegar mal el perfil de Steam
-- es el error más probable de todo el flujo y no hay razón para que se
-- arregle solo escribiéndote.
-- ---------------------------------------------------------------------------

create or replace function inscribirse_sorteo(
  p_usuario_id uuid,
  p_sorteo_id uuid,
  p_discord text,
  p_steam_url text
)
returns inscripciones_sorteo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sorteo sorteos%rowtype;
  v_perfil perfiles%rowtype;
  v_inscripcion inscripciones_sorteo%rowtype;
begin
  if p_discord is null or trim(p_discord) = '' then
    raise exception 'Indica tu usuario de Discord' using errcode = 'P0210';
  end if;
  if p_steam_url is null or trim(p_steam_url) = '' then
    raise exception 'Indica tu link de Steam' using errcode = 'P0211';
  end if;
  if position('steamcommunity.com' in lower(p_steam_url)) = 0 then
    raise exception 'El link debe ser tu perfil de steamcommunity.com' using errcode = 'P0212';
  end if;

  select * into v_sorteo from sorteos where id = p_sorteo_id;
  if not found then
    raise exception 'Sorteo no encontrado' using errcode = 'P0213';
  end if;
  if not v_sorteo.activo then
    raise exception 'Este sorteo ya está cerrado' using errcode = 'P0214';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0215';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0216';
  end if;

  insert into inscripciones_sorteo (sorteo_id, usuario_id, discord, steam_url)
  values (p_sorteo_id, p_usuario_id, trim(p_discord), trim(p_steam_url))
  on conflict (sorteo_id, usuario_id) do update
    set discord = excluded.discord,
        steam_url = excluded.steam_url
  returning * into v_inscripcion;

  return v_inscripcion;
end;
$$;

revoke all on function inscribirse_sorteo(uuid, uuid, text, text) from public;
grant execute on function inscribirse_sorteo(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- admin_guardar_sorteo: crea uno nuevo (p_sorteo_id null) o edita el que se
-- le pase. Una sola función porque el formulario del panel es el mismo.
-- ---------------------------------------------------------------------------

create or replace function admin_guardar_sorteo(
  p_admin_id uuid,
  p_sorteo_id uuid,
  p_nombre text,
  p_premio text,
  p_instrucciones text,
  p_fecha_sorteo date,
  p_activo boolean
)
returns sorteos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sorteo sorteos%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede publicar sorteos' using errcode = 'P0220';
  end if;
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'Ponle un nombre al sorteo' using errcode = 'P0221';
  end if;
  if p_premio is null or trim(p_premio) = '' then
    raise exception 'Indica qué se sortea' using errcode = 'P0222';
  end if;

  if p_sorteo_id is null then
    insert into sorteos (admin_id, nombre, premio, instrucciones, fecha_sorteo, activo)
    values (
      p_admin_id,
      trim(p_nombre),
      trim(p_premio),
      nullif(trim(coalesce(p_instrucciones, '')), ''),
      p_fecha_sorteo,
      coalesce(p_activo, true)
    )
    returning * into v_sorteo;
  else
    update sorteos
      set nombre = trim(p_nombre),
          premio = trim(p_premio),
          instrucciones = nullif(trim(coalesce(p_instrucciones, '')), ''),
          fecha_sorteo = p_fecha_sorteo,
          activo = coalesce(p_activo, true)
      where id = p_sorteo_id
      returning * into v_sorteo;

    if not found then
      raise exception 'Sorteo no encontrado' using errcode = 'P0223';
    end if;
  end if;

  return v_sorteo;
end;
$$;

revoke all on function admin_guardar_sorteo(uuid, uuid, text, text, text, date, boolean) from public;
grant execute on function admin_guardar_sorteo(uuid, uuid, text, text, text, date, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- admin_marcar_ganador: alterna el ganador de una inscripción. Se permite
-- más de un ganador por sorteo — un cofre por persona, pero puedes tener
-- varios cofres para el mismo sorteo.
-- ---------------------------------------------------------------------------

create or replace function admin_marcar_ganador(
  p_admin_id uuid,
  p_inscripcion_id uuid,
  p_ganador boolean
)
returns inscripciones_sorteo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inscripcion inscripciones_sorteo%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede marcar ganadores' using errcode = 'P0230';
  end if;

  update inscripciones_sorteo
    set ganador = coalesce(p_ganador, false)
    where id = p_inscripcion_id
    returning * into v_inscripcion;

  if not found then
    raise exception 'Inscripción no encontrada' using errcode = 'P0231';
  end if;

  return v_inscripcion;
end;
$$;

revoke all on function admin_marcar_ganador(uuid, uuid, boolean) from public;
grant execute on function admin_marcar_ganador(uuid, uuid, boolean) to service_role;
