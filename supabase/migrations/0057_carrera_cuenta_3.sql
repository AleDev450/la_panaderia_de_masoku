-- =============================================================================
-- CACHUDOBET — La largada cuenta 3, 2, 1
-- 0057_carrera_cuenta_3.sql
--
-- 0056 dejaba 5 segundos entre el clic y la largada. Son demasiados para lo
-- que la gente espera de una partida de caballos: la cuenta que todo el mundo
-- reconoce es "3, 2, 1, ¡corran!".
--
-- LOS 3 SEGUNDOS SIGUEN CUBRIENDO EL POLLING, que es para lo que estaban ahí
-- además del show. La pantalla de la carrera pregunta cada 2 segundos, así
-- que el margen alcanza para que todos lleguen a ver la cuenta desde el
-- principio. Quien igual se enganche tarde no se pierde nada: la animación se
-- mide contra `inicia_en`, así que cae en el punto exacto en el que va la
-- carrera en vez de arrancarla de cero.
--
-- Es el ÚNICO cambio: el resto de la función es idéntico a 0056.
-- =============================================================================

create or replace function admin_correr_carrera(
  p_admin_id uuid,
  p_sorteo_id uuid
)
returns carreras_sorteo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inscripcion inscripciones_sorteo%rowtype;
  v_carrera carreras_sorteo%rowtype;
  v_caballo integer;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede largar la carrera' using errcode = 'P0440';
  end if;

  if not exists (select 1 from sorteos where id = p_sorteo_id) then
    raise exception 'Sorteo no encontrado' using errcode = 'P0441';
  end if;

  -- Ponderado por tickets (Efraimidis–Spirakis, ver 0038): `random()^(1/n)`
  -- da probabilidad exactamente proporcional en una sola pasada.
  update inscripciones_sorteo
    set ganador = true
    where id = (
      select id
      from inscripciones_sorteo
      where sorteo_id = p_sorteo_id
        and not ganador
        and tickets > 0
      order by power(random(), 1.0 / tickets::float8) desc
      limit 1
    )
    returning * into v_inscripcion;

  if not found then
    raise exception 'No queda nadie con tickets para correr' using errcode = 'P0442';
  end if;

  -- Cuál de SUS caballos cruza primero. Uniforme entre los suyos: con la
  -- ponderación de arriba, esto da 1/total por caballo (ver 0056).
  v_caballo := 1 + floor(random() * v_inscripcion.tickets)::integer;

  insert into carreras_sorteo (
    sorteo_id, inscripcion_ganadora_id, caballo_numero, semilla, inicia_en
  )
  values (
    p_sorteo_id,
    v_inscripcion.id,
    v_caballo,
    gen_random_uuid()::text,
    now() + interval '3 seconds'
  )
  returning * into v_carrera;

  return v_carrera;
end;
$$;

revoke all on function admin_correr_carrera(uuid, uuid) from public;
grant execute on function admin_correr_carrera(uuid, uuid) to service_role;
