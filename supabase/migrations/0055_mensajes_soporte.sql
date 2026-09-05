-- =============================================================================
-- CACHUDOBET — Mensajes entre el jugador y el staff
-- 0055_mensajes_soporte.sql
--
-- UN HILO POR JUGADOR, no conversaciones sueltas. `usuario_id` es SIEMPRE el
-- jugador dueño del hilo, escriba quien escriba; `autor_id` es quien mandó
-- ese mensaje en particular. Con eso, "los mensajes de Fulano" es un filtro
-- por una columna y no una búsqueda por participantes.
--
-- `de_staff` sale del ROL DEL AUTOR y no de un parámetro: si el cliente
-- pudiera elegir la dirección, cualquiera se mandaría un mensaje "del staff"
-- a sí mismo y después mostraría la captura.
--
-- UN JUGADOR SUSPENDIDO SÍ PUEDE ESCRIBIR. Es a propósito: el que está
-- baneado es justamente el que más necesita poder reclamar. Lo que no puede
-- es apostar.
--
-- `leido` es del DESTINATARIO: un mensaje del jugador lo marca leído el
-- staff, y al revés. Sirve para el globito del panel y para que el jugador
-- vea que le respondieron.
-- =============================================================================

create table if not exists mensajes_soporte (
  id uuid primary key default gen_random_uuid(),
  -- El hilo: siempre el jugador, nunca el admin.
  usuario_id uuid not null references perfiles (id) on delete cascade,
  autor_id uuid not null references perfiles (id) on delete cascade,
  de_staff boolean not null,
  cuerpo text not null,
  leido boolean not null default false,
  created_at timestamptz not null default now(),
  constraint cuerpo_no_vacio check (char_length(btrim(cuerpo)) between 1 and 2000)
);

create index if not exists idx_mensajes_hilo
  on mensajes_soporte (usuario_id, created_at);

-- Para contar lo no leído sin recorrer la tabla entera: el globo del panel
-- lo pregunta cada 30 segundos.
create index if not exists idx_mensajes_sin_leer
  on mensajes_soporte (usuario_id)
  where not leido;

alter table mensajes_soporte enable row level security;

-- Cada uno ve su hilo; el staff ve todos. Sin policies de escritura: la
-- única forma de crear un mensaje es el RPC.
drop policy if exists mensajes_select on mensajes_soporte;
create policy mensajes_select
  on mensajes_soporte
  for select using (auth.uid() = usuario_id or es_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- enviar_mensaje_soporte
--
-- El mismo RPC sirve para los dos lados; la dirección la decide el rol.
-- Un jugador solo puede escribir en SU hilo — `p_usuario_id` se ignora para
-- él y se usa su propio id, así que no hay forma de escribirle a otro.
-- ---------------------------------------------------------------------------

create or replace function enviar_mensaje_soporte(
  p_autor_id uuid,
  p_usuario_id uuid,
  p_cuerpo text
)
returns mensajes_soporte
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_admin boolean;
  v_hilo uuid;
  v_mensaje mensajes_soporte%rowtype;
  v_destino perfiles%rowtype;
begin
  if p_cuerpo is null or btrim(p_cuerpo) = '' then
    raise exception 'El mensaje está vacío' using errcode = 'P0430';
  end if;
  if char_length(btrim(p_cuerpo)) > 2000 then
    raise exception 'El mensaje es demasiado largo (máximo 2000 caracteres)' using errcode = 'P0431';
  end if;

  v_es_admin := es_admin(p_autor_id);

  if v_es_admin then
    -- El staff elige a quién le escribe, pero solo a jugadores: un hilo
    -- entre dos admins no tendría dueño.
    select * into v_destino from perfiles where id = p_usuario_id;
    if not found then
      raise exception 'Usuario no encontrado' using errcode = 'P0432';
    end if;
    if v_destino.rol <> 'user' then
      raise exception 'Solo se le puede escribir a un jugador' using errcode = 'P0433';
    end if;
    v_hilo := p_usuario_id;
  else
    -- El jugador escribe en el suyo, venga lo que venga en el parámetro.
    v_hilo := p_autor_id;
  end if;

  insert into mensajes_soporte (usuario_id, autor_id, de_staff, cuerpo)
  values (v_hilo, p_autor_id, v_es_admin, btrim(p_cuerpo))
  returning * into v_mensaje;

  return v_mensaje;
end;
$$;

revoke all on function enviar_mensaje_soporte(uuid, uuid, text) from public;
grant execute on function enviar_mensaje_soporte(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- marcar_mensajes_leidos: marca lo que le escribieron A QUIEN LEE.
--
-- El staff marca lo que mandó el jugador; el jugador marca lo que mandó el
-- staff. Nadie marca como leídos sus propios mensajes — si no, el globo se
-- apagaría solo al escribir.
-- ---------------------------------------------------------------------------

create or replace function marcar_mensajes_leidos(
  p_lector_id uuid,
  p_usuario_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_admin boolean;
  v_hilo uuid;
  v_marcados integer;
begin
  v_es_admin := es_admin(p_lector_id);
  v_hilo := case when v_es_admin then p_usuario_id else p_lector_id end;

  update mensajes_soporte
    set leido = true
    where usuario_id = v_hilo
      and not leido
      -- Lo que escribió el OTRO lado.
      and de_staff <> v_es_admin;

  get diagnostics v_marcados = row_count;
  return v_marcados;
end;
$$;

revoke all on function marcar_mensajes_leidos(uuid, uuid) from public;
grant execute on function marcar_mensajes_leidos(uuid, uuid) to service_role;
