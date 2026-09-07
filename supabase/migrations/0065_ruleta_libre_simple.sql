-- =============================================================================
-- CACHUDOBET — La ruleta libre se abre con dos datos
-- 0065_ruleta_libre_simple.sql
--
-- QUÉ CAMBIA respecto de 0064:
--
--   · Quien la abre pone SOLO el nombre y el precio del ticket. Con cuántos
--     entra deja de preguntarse: entra con UNO. Abrir una ruleta y elegir de
--     cuánto entrar son dos decisiones distintas, y juntarlas en el mismo
--     formulario obligaba a pensar dos cosas para hacer una. Si quiere más
--     tickets, los compra después como cualquiera.
--
--   · El precio mínimo del ticket pasa a S/1. Antes el piso era "mayor a 0",
--     que dejaba abrir ruletas de S/0.10 donde el pozo nunca llega a nada.
--
--   · SIN TOPE DE TICKETS. Una ruleta libre nace con
--     `max_tickets_por_persona` en null a propósito: el tope (0063) es una
--     herramienta del staff para sus rondas, y acá no hay staff que la
--     configure. Quien la abre no puede limitar a los demás.
--
-- Se reemplaza la función entera en vez de agregarle un default: la firma
-- cambia de 4 argumentos a 3, y dejar viva la de 0064 permitiría seguir
-- llamándola con un monto arbitrario, que es justo lo que se quita.
-- =============================================================================

drop function if exists crear_ronda_libre(uuid, text, numeric, numeric);

create or replace function crear_ronda_libre(
  p_usuario_id uuid,
  p_nombre text,
  p_precio_ticket numeric
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config cachudobet_config%rowtype;
  v_perfil perfiles%rowtype;
  v_ronda ruleta_rondas%rowtype;
  v_precio numeric(12, 2);
begin
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'Ponle un nombre a tu ruleta' using errcode = 'P0350';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0351';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede crear una ruleta libre' using errcode = 'P0352';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0353';
  end if;

  select * into v_config from cachudobet_config where id;
  v_precio := round(coalesce(nullif(p_precio_ticket, 0), v_config.precio_ticket), 2);

  -- Piso de S/1: por debajo de eso el pozo no llega a nada y la ruleta es
  -- un trámite sin premio.
  if v_precio < 1 then
    raise exception 'El ticket tiene que costar al menos S/1' using errcode = 'P0354';
  end if;
  if v_precio > 100 then
    raise exception 'En una ruleta libre el ticket no puede pasar de S/100'
      using errcode = 'P0355';
  end if;

  -- El creador tiene que poder pagar su ticket de entrada. Se valida acá para
  -- dar el mensaje claro; `comprar_tickets_ruleta` lo revalida igual.
  if v_perfil.saldo_disponible < v_precio then
    raise exception 'Necesitas S/% para abrir tu ruleta y entrar con tu ticket',
      trim(to_char(v_precio, 'FM999999990.00'))
      using errcode = 'P0358';
  end if;

  -- Solo una ruleta libre por persona a la vez.
  if exists (
    select 1 from ruleta_rondas
    where modo = 'libre'
      and admin_id = p_usuario_id
      and ganador_ticket_id is null
      and estado <> 'cancelada'
  ) then
    raise exception 'Ya tienes una ruleta libre abierta' using errcode = 'P0356';
  end if;

  insert into ruleta_rondas (
    admin_id, nombre, premio_concepto,
    precio_ticket, porcentaje_premio, porcentaje_casa, modo, estado, abierta_at,
    max_tickets_por_persona
  )
  values (
    p_usuario_id,
    trim(p_nombre),
    'Se reparte el pozo',
    v_precio,
    v_config.porcentaje_premio,
    v_config.porcentaje_casa,
    'libre',
    'abierta',
    now(),
    -- Tickets ilimitados: explícito para que se lea como decisión y no como
    -- un olvido.
    null
  )
  returning * into v_ronda;

  -- Entra con UN ticket. Todo en la misma transacción: si la compra falla, la
  -- ronda no llega a existir.
  perform comprar_tickets_ruleta(p_usuario_id, v_ronda.id, v_precio);

  select * into v_ronda from ruleta_rondas where id = v_ronda.id;
  return v_ronda;
end;
$$;

revoke all on function crear_ronda_libre(uuid, text, numeric) from public;
grant execute on function crear_ronda_libre(uuid, text, numeric) to service_role;
