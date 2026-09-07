-- =============================================================================
-- CACHUDOBET — El precio del ticket se define por ronda
-- 0060_precio_ticket_por_ronda.sql
--
-- Hasta ahora el precio salía SIEMPRE de `cachudobet_config`, igual para toda
-- la plataforma. Eso obliga a cambiar la configuración global cada vez que se
-- quiere una carrera más barata o una ruleta con pozo más gordo — y ese cambio
-- se queda puesto para la siguiente sin que nadie lo note.
--
-- Ahora se puede mandar un precio al crear o editar la ronda. Si no se manda,
-- se sigue usando el de la config: las llamadas viejas se comportan igual.
--
-- SOLO SE PUEDE CAMBIAR MIENTRAS NO HAYA TICKETS VENDIDOS. Con gente adentro,
-- mover el precio dejaría el pozo sin explicación: `pozo_total` es la suma de
-- lo que YA se pagó, así que unos habrían comprado a un precio y otros a otro,
-- y la ronda no podría decir con honestidad cuánto vale un ticket.
--
-- La columna `precio_ticket` de la ronda ya existía desde 0048 y ya se copiaba
-- al crear; lo único que faltaba era poder elegir qué copiar.
-- =============================================================================

drop function if exists admin_guardar_ronda(uuid, uuid, text, text, text);

create or replace function admin_guardar_ronda(
  p_admin_id uuid,
  p_ronda_id uuid,
  p_nombre text,
  p_premio_concepto text,
  p_modo text default 'ruleta',
  p_precio_ticket numeric default null
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config cachudobet_config%rowtype;
  v_ronda ruleta_rondas%rowtype;
  v_modo text;
  v_precio numeric(12, 2);
  v_vendidos integer;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede crear rondas' using errcode = 'P0310';
  end if;
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'Ponle un nombre a la ronda' using errcode = 'P0311';
  end if;

  v_modo := coalesce(nullif(trim(coalesce(p_modo, '')), ''), 'ruleta');
  if v_modo not in ('ruleta', 'carrera') then
    raise exception 'Modo de ronda desconocido' using errcode = 'P0314';
  end if;

  if p_precio_ticket is not null then
    v_precio := round(p_precio_ticket, 2);
    if v_precio <= 0 then
      raise exception 'El precio del ticket debe ser mayor a 0' using errcode = 'P0315';
    end if;
    if v_precio > 1000 then
      raise exception 'Un ticket no puede costar más de S/1000' using errcode = 'P0316';
    end if;
  end if;

  select * into v_config from cachudobet_config where id;

  if p_ronda_id is null then
    insert into ruleta_rondas (
      admin_id, nombre, premio_concepto,
      precio_ticket, porcentaje_premio, porcentaje_casa, modo
    )
    values (
      p_admin_id,
      trim(p_nombre),
      nullif(trim(coalesce(p_premio_concepto, '')), ''),
      -- Sin precio explícito manda la config, como siempre.
      coalesce(v_precio, v_config.precio_ticket),
      v_config.porcentaje_premio,
      v_config.porcentaje_casa,
      v_modo
    )
    returning * into v_ronda;
  else
    select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
    if not found then
      raise exception 'Ronda no encontrada' using errcode = 'P0312';
    end if;
    if v_ronda.ganador_ticket_id is not null then
      raise exception 'Esta ronda ya se sorteó: no se puede editar' using errcode = 'P0313';
    end if;

    -- El precio solo se mueve si todavía no compró nadie.
    if v_precio is not null and v_precio <> v_ronda.precio_ticket then
      select count(*) into v_vendidos from ruleta_tickets where ronda_id = p_ronda_id;
      if v_vendidos > 0 then
        raise exception
          'Ya se vendieron % ticket(s): no se puede cambiar el precio', v_vendidos
          using errcode = 'P0317';
      end if;
    end if;

    update ruleta_rondas
      set nombre = trim(p_nombre),
          premio_concepto = nullif(trim(coalesce(p_premio_concepto, '')), ''),
          modo = v_modo,
          precio_ticket = coalesce(v_precio, precio_ticket)
      where id = p_ronda_id
      returning * into v_ronda;
  end if;

  return v_ronda;
end;
$$;

revoke all on function admin_guardar_ronda(uuid, uuid, text, text, text, numeric) from public;
grant execute on function admin_guardar_ronda(uuid, uuid, text, text, text, numeric) to service_role;
