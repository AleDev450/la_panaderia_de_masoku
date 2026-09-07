-- =============================================================================
-- CACHUDOBET — El reloj de la ruleta libre se ajusta desde el panel
-- 0066_config_ruleta_libre.sql
--
-- 0064 guardó `libre_minutos` y `libre_min_jugadores` en la config, pero
-- `admin_guardar_config` seguía siendo la de 0048 y no los recibía: los
-- valores estaban ahí y no había forma de cambiarlos sin entrar al SQL. Un
-- parámetro que solo se puede tocar con un `update` a mano es, en la práctica,
-- un número clavado en el código.
--
-- Los dos límites del check (1 a 1440 minutos, mínimo 2 jugadores) los sigue
-- imponiendo la tabla desde 0064; acá se validan antes para dar un mensaje
-- que se entienda en vez de un error de constraint.
--
-- Cambia la firma → drop de la de 0048 antes de recrear.
-- =============================================================================

drop function if exists admin_guardar_config(uuid, numeric, numeric, numeric, numeric, numeric);

create or replace function admin_guardar_config(
  p_admin_id uuid,
  p_precio_ticket numeric,
  p_porcentaje_premio numeric,
  p_cara_sello_multiplicador numeric,
  p_cara_sello_min numeric,
  p_cara_sello_max numeric,
  p_libre_minutos integer default null,
  p_libre_min_jugadores integer default null
)
returns cachudobet_config
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config cachudobet_config%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede cambiar la configuración' using errcode = 'P0300';
  end if;
  if p_precio_ticket is null or p_precio_ticket <= 0 then
    raise exception 'El precio del ticket debe ser mayor a 0' using errcode = 'P0301';
  end if;
  if p_porcentaje_premio is null or p_porcentaje_premio < 0 or p_porcentaje_premio > 100 then
    raise exception 'El porcentaje del premio va entre 0 y 100' using errcode = 'P0302';
  end if;
  if p_cara_sello_multiplicador is null or p_cara_sello_multiplicador <= 1 then
    raise exception 'El multiplicador debe ser mayor a 1' using errcode = 'P0303';
  end if;
  if p_cara_sello_min is null or p_cara_sello_min <= 0 or p_cara_sello_max < p_cara_sello_min then
    raise exception 'El rango de apuesta de cara o sello es inválido' using errcode = 'P0304';
  end if;

  if p_libre_minutos is not null and (p_libre_minutos < 1 or p_libre_minutos > 1440) then
    raise exception 'El reloj de la ruleta libre va entre 1 y 1440 minutos'
      using errcode = 'P0305';
  end if;
  if p_libre_min_jugadores is not null and p_libre_min_jugadores < 2 then
    raise exception 'Hacen falta al menos 2 jugadores para que arranque el reloj'
      using errcode = 'P0306';
  end if;

  update cachudobet_config
    set precio_ticket = round(p_precio_ticket, 2),
        porcentaje_premio = round(p_porcentaje_premio, 2),
        -- La casa es siempre el complemento: dos campos libres se
        -- desincronizan y el check de suma 100 rebota sin explicar nada.
        porcentaje_casa = round(100 - p_porcentaje_premio, 2),
        cara_sello_multiplicador = round(p_cara_sello_multiplicador, 2),
        cara_sello_min = round(p_cara_sello_min, 2),
        cara_sello_max = round(p_cara_sello_max, 2),
        -- `coalesce` para que una llamada que no los mande no los pise: así
        -- una versión vieja del panel no borra lo que configuró la nueva.
        libre_minutos = coalesce(p_libre_minutos, libre_minutos),
        libre_min_jugadores = coalesce(p_libre_min_jugadores, libre_min_jugadores)
    where id
    returning * into v_config;

  return v_config;
end;
$$;

revoke all on function admin_guardar_config(
  uuid, numeric, numeric, numeric, numeric, numeric, integer, integer
) from public;
grant execute on function admin_guardar_config(
  uuid, numeric, numeric, numeric, numeric, numeric, integer, integer
) to service_role;

-- Lo que pidió el operador: 2 minutos en vez de 10. Va acá y no como un
-- `update` suelto para que el valor con el que arranca quede en la historia
-- del esquema.
update cachudobet_config set libre_minutos = 2 where id;
