-- =============================================================================
-- LA PANCA — Abrir apuestas sin límite de tiempo (+ opción de tiempo extra)
-- 0023_abrir_sin_tiempo.sql
--
-- Antes, "Abrir" siempre le ponía un reloj al título (el minutaje del
-- formulario de creación, o 10 min por defecto) si ya había vencido. Ahora
-- el comportamiento por defecto es abrir SIN límite de tiempo — el título
-- se queda abierto hasta que el admin lo cierre a mano — y el minutaje
-- pasa a ser una opción aparte para cuando sí se quiere una ventana
-- puntual ("ábrelo 15 minutos más").
--
-- No hay una columna "sin límite" en el esquema; en vez de volver
-- `cierra_en` nullable (y tocar cada lugar que la compara con `now()`),
-- "sin límite" se representa empujando `cierra_en` 100 años al futuro —
-- en la práctica nunca vence, y todo el código que ya compara contra
-- `now()` sigue funcionando sin cambios.
--
-- p_minutos default null (antes: default 10):
--   null           -> abre sin límite de tiempo
--   1..1440        -> abre con cierra_en = now() + esos minutos, sin
--                      importar si el título ya estaba abierto o vencido
--                      (a diferencia de antes, que solo empujaba el reloj
--                      si ya había vencido) — pedir tiempo extra a propósito
--                      siempre debe darte ese tiempo desde ahora.
-- =============================================================================

create or replace function admin_cambiar_estado_evento(
  p_admin_id uuid,
  p_evento_id uuid,
  p_abrir boolean,
  p_minutos integer default null
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede abrir o cerrar apuestas' using errcode = 'P0070';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0071';
  end if;
  if v_evento.estado = 'resuelto' then
    raise exception 'El evento ya fue resuelto' using errcode = 'P0072';
  end if;

  if p_abrir then
    update eventos
      set estado = 'abierto',
          cierra_en = case
            when p_minutos is not null then now() + make_interval(mins => greatest(p_minutos, 1))
            else now() + interval '100 years'
          end
      where id = p_evento_id
      returning * into v_evento;
  else
    update eventos set estado = 'cerrado' where id = p_evento_id
    returning * into v_evento;
  end if;

  return v_evento;
end;
$$;

revoke all on function admin_cambiar_estado_evento(uuid, uuid, boolean, integer) from public;
grant execute on function admin_cambiar_estado_evento(uuid, uuid, boolean, integer) to service_role;
