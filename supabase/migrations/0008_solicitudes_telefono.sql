-- =============================================================================
-- LA PANCA — Perfil de jugador
-- 0008_solicitudes_telefono.sql: el jugador puede cambiar su nickname y su
-- correo por su cuenta, pero NO su teléfono — ese cambio pasa por una cola
-- que un admin aprueba o rechaza desde /bakery/telefonos.
--
-- El teléfono se trata distinto a propósito: es el dato con el que el
-- equipo identifica los depósitos de una recarga, así que dejar que el
-- jugador lo cambie solo abriría la puerta a reclamar depósitos ajenos.
-- =============================================================================

-- Igual que en 0006: Postgres no tiene `create type if not exists`, y esta
-- migración debe poder re-ejecutarse sin chocar.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_solicitud') then
    create type estado_solicitud as enum ('pendiente', 'aprobada', 'rechazada');
  end if;
end
$$;

create table if not exists solicitudes_telefono (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id) on delete cascade,
  telefono_actual text,
  telefono_nuevo text not null,
  motivo text,
  estado estado_solicitud not null default 'pendiente',
  revisado_por uuid references perfiles (id),
  revisado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_solicitudes_telefono_estado
  on solicitudes_telefono (estado, created_at desc);

-- Una sola solicitud pendiente por usuario a la vez — evita que alguien
-- llene la cola del admin con decenas de pedidos.
create unique index if not exists idx_solicitudes_telefono_una_pendiente
  on solicitudes_telefono (usuario_id)
  where estado = 'pendiente';

alter table solicitudes_telefono enable row level security;

-- El jugador ve y crea solo las suyas; la aprobación pasa por el RPC de
-- abajo (security definer), nunca por un update directo del cliente.
drop policy if exists solicitudes_telefono_select_own on solicitudes_telefono;
create policy solicitudes_telefono_select_own on solicitudes_telefono
  for select using (auth.uid() = usuario_id or es_admin(auth.uid()));

drop policy if exists solicitudes_telefono_insert_own on solicitudes_telefono;
create policy solicitudes_telefono_insert_own on solicitudes_telefono
  for insert with check (auth.uid() = usuario_id);

-- ---------------------------------------------------------------------------
-- admin_resolver_solicitud_telefono (solo admin)
--
-- Aprobar aplica el teléfono nuevo al perfil y cierra la solicitud, todo en
-- una transacción — mismo patrón que el resto de RPC de admin: recibe
-- p_admin_id explícito y solo lo puede invocar service_role, porque el
-- servidor Next.js ya resolvió la sesión real antes de llamar.
-- ---------------------------------------------------------------------------

create or replace function admin_resolver_solicitud_telefono(
  p_admin_id uuid,
  p_solicitud_id uuid,
  p_aprobar boolean
)
returns solicitudes_telefono
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud solicitudes_telefono%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede resolver solicitudes' using errcode = 'P0040';
  end if;

  select * into v_solicitud from solicitudes_telefono where id = p_solicitud_id for update;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0041';
  end if;
  if v_solicitud.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya fue revisada' using errcode = 'P0042';
  end if;

  if p_aprobar then
    update perfiles set phone = v_solicitud.telefono_nuevo where id = v_solicitud.usuario_id;
  end if;

  update solicitudes_telefono
    set estado = (case when p_aprobar then 'aprobada' else 'rechazada' end)::estado_solicitud,
        revisado_por = p_admin_id,
        revisado_at = now()
    where id = p_solicitud_id
    returning * into v_solicitud;

  return v_solicitud;
end;
$$;

revoke all on function admin_resolver_solicitud_telefono(uuid, uuid, boolean) from public;
grant execute on function admin_resolver_solicitud_telefono(uuid, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- actualizar_nickname: el unique index de `perfiles.nickname` ya garantiza
-- que no se repita; esta función solo traduce ese choque a un mensaje
-- entendible en vez de un error crudo de constraint.
-- ---------------------------------------------------------------------------

create or replace function actualizar_nickname(
  p_usuario_id uuid,
  p_nickname text
)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
begin
  if exists (
    select 1 from perfiles
    where lower(nickname) = lower(p_nickname) and id <> p_usuario_id
  ) then
    raise exception 'Ese nickname ya está en uso' using errcode = 'P0043';
  end if;

  update perfiles set nickname = p_nickname where id = p_usuario_id
  returning * into v_perfil;

  if not found then
    raise exception 'Perfil no encontrado' using errcode = 'P0044';
  end if;

  return v_perfil;
end;
$$;

revoke all on function actualizar_nickname(uuid, text) from public;
grant execute on function actualizar_nickname(uuid, text) to service_role;
