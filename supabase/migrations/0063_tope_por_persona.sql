-- =============================================================================
-- CACHUDOBET — Tope de caballos (o tickets) por persona
-- 0063_tope_por_persona.sql
--
-- PARA QUÉ SIRVE. Sin tope, una sola persona puede comprarse la ronda entera.
-- Eso rompe el juego por dos lados a la vez:
--
--   · Para ella: con más del 80% del pozo su premio no alcanza a cubrir lo que
--     puso. Gana y pierde plata igual (por eso existe 0051).
--   · Para los demás: una rueda donde alguien tiene el 90% no es un sorteo,
--     es un trámite. Y aunque el azar sea impecable, verlo ganar siempre se
--     lee como que está arreglado.
--
-- Con un tope, las rondas quedan parejas, los sorteos se vuelven
-- impredecibles, y la casa cobra MÁS: su comisión sale de la plata ajena
-- (0051), así que mientras más repartido esté el pozo, más ajeno hay.
--
-- `null` = sin tope, que es como se comportaba hasta ahora. Las rondas que ya
-- existen no cambian.
--
-- EL TOPE CUENTA TODOS LOS TICKETS DE LA PERSONA, incluidos los que el staff
-- le regaló a mano. Lo que se limita es cuánto de la ronda puede ocupar
-- alguien, no cuánto gastó: si el tope contara solo lo comprado, un par de
-- regalos lo dejarían sin efecto.
--
-- `admin_agregar_tickets` NO valida el tope a propósito: regalar es una
-- decisión deliberada del staff, y trabarla obligaría a subir el tope de la
-- ronda para hacer un regalo. Lo que sí hace el regalo es consumir el cupo de
-- esa persona para comprar.
-- =============================================================================

alter table ruleta_rondas
  add column if not exists max_tickets_por_persona integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tope_positivo') then
    alter table ruleta_rondas
      add constraint tope_positivo
      check (max_tickets_por_persona is null or max_tickets_por_persona > 0);
  end if;
end;
$$;

comment on column ruleta_rondas.max_tickets_por_persona is
  'Cuántos tickets como máximo puede tener UNA persona en esta ronda (0063). Null = sin tope. Cuenta también los que le regaló el staff.';

-- ---------------------------------------------------------------------------
-- comprar_tickets_ruleta: mismo cuerpo de 0048 + el tope.
-- ---------------------------------------------------------------------------

create or replace function comprar_tickets_ruleta(
  p_usuario_id uuid,
  p_ronda_id uuid,
  p_monto numeric
)
returns setof ruleta_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda ruleta_rondas%rowtype;
  v_perfil perfiles%rowtype;
  v_cantidad integer;
  v_ultimo integer;
  v_ya integer;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0330';
  end if;
  p_monto := round(p_monto, 2);

  select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
  if not found then
    raise exception 'Ronda no encontrada' using errcode = 'P0331';
  end if;
  if v_ronda.estado <> 'abierta' then
    raise exception 'Esta ronda no está abierta' using errcode = 'P0332';
  end if;

  if mod(p_monto, v_ronda.precio_ticket) <> 0 then
    raise exception 'El monto debe ser múltiplo de S/%', trim(to_char(v_ronda.precio_ticket, 'FM999999990.00'))
      using errcode = 'P0333';
  end if;

  v_cantidad := (p_monto / v_ronda.precio_ticket)::integer;
  if v_cantidad < 1 then
    raise exception 'Necesitas comprar al menos un ticket' using errcode = 'P0334';
  end if;
  -- Tope por operación: una compra de miles de tickets es casi siempre un
  -- monto mal tipeado, y cada ticket es una fila.
  if v_cantidad > 500 then
    raise exception 'Máximo 500 tickets por compra' using errcode = 'P0335';
  end if;

  -- El tope de la ronda (0063). Se cuenta con la fila de la ronda ya
  -- bloqueada más arriba, así que dos compras simultáneas de la misma persona
  -- se resuelven una después de la otra y ninguna se cuela por encima.
  if v_ronda.max_tickets_por_persona is not null then
    select count(*) into v_ya
    from ruleta_tickets
    where ronda_id = p_ronda_id and usuario_id = p_usuario_id;

    if v_ya + v_cantidad > v_ronda.max_tickets_por_persona then
      raise exception
        'En esta ronda el máximo es % por persona y ya tienes %: puedes llevar % más',
        v_ronda.max_tickets_por_persona,
        v_ya,
        greatest(v_ronda.max_tickets_por_persona - v_ya, 0)
        using errcode = 'P0340';
    end if;
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0336';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede participar' using errcode = 'P0337';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0338';
  end if;
  -- Solo saldo real: el fake no entra al pozo.
  if v_perfil.saldo_disponible < p_monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0339';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible - p_monto
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (p_usuario_id, 'ticket_ruleta', p_monto, false);

  select coalesce(max(numero), 0) into v_ultimo
  from ruleta_tickets where ronda_id = p_ronda_id;

  return query
  with nuevos as (
    insert into ruleta_tickets (ronda_id, usuario_id, numero, codigo, monto)
    select
      p_ronda_id,
      p_usuario_id,
      v_ultimo + i,
      lpad(v_ronda.numero::text, 4, '0') || '-' || lpad((v_ultimo + i)::text, 5, '0'),
      v_ronda.precio_ticket
    from generate_series(1, v_cantidad) as i
    returning *
  )
  select * from nuevos order by numero;

  update ruleta_rondas
    set pozo_total = pozo_total + p_monto
    where id = p_ronda_id;

  return;
end;
$$;

revoke all on function comprar_tickets_ruleta(uuid, uuid, numeric) from public;
grant execute on function comprar_tickets_ruleta(uuid, uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- admin_guardar_ronda: ahora también recibe el tope.
--
-- Cambia la firma → drop de la de 0060 antes de recrear.
--
-- El tope SÍ se puede bajar con gente adentro, a diferencia del precio: no
-- reescribe nada de lo ya comprado, solo impide comprar más. Quien ya se pasó
-- se queda con lo suyo y no puede sumar.
-- ---------------------------------------------------------------------------

drop function if exists admin_guardar_ronda(uuid, uuid, text, text, text, numeric);

create or replace function admin_guardar_ronda(
  p_admin_id uuid,
  p_ronda_id uuid,
  p_nombre text,
  p_premio_concepto text,
  p_modo text default 'ruleta',
  p_precio_ticket numeric default null,
  p_max_tickets integer default null
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

  if p_max_tickets is not null and p_max_tickets < 1 then
    raise exception 'El tope por persona debe ser al menos 1' using errcode = 'P0341';
  end if;

  select * into v_config from cachudobet_config where id;

  if p_ronda_id is null then
    insert into ruleta_rondas (
      admin_id, nombre, premio_concepto,
      precio_ticket, porcentaje_premio, porcentaje_casa, modo, max_tickets_por_persona
    )
    values (
      p_admin_id,
      trim(p_nombre),
      nullif(trim(coalesce(p_premio_concepto, '')), ''),
      coalesce(v_precio, v_config.precio_ticket),
      v_config.porcentaje_premio,
      v_config.porcentaje_casa,
      v_modo,
      p_max_tickets
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
          precio_ticket = coalesce(v_precio, precio_ticket),
          -- El tope sí se puede dejar en null para quitarlo.
          max_tickets_por_persona = p_max_tickets
      where id = p_ronda_id
      returning * into v_ronda;
  end if;

  return v_ronda;
end;
$$;

revoke all on function admin_guardar_ronda(uuid, uuid, text, text, text, numeric, integer) from public;
grant execute on function admin_guardar_ronda(uuid, uuid, text, text, text, numeric, integer) to service_role;
