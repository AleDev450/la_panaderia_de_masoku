-- =============================================================================
-- LA PANCA — Blackjack: solo el jugador pide cartas, el host no
-- 0040_blackjack_solo_jugador_pide.sql
--
-- En una mesa hay dos apostadores, pero solo UNA mano se juega: la del
-- jugador. El otro apuesta a que gana el host, y el host no elige nada —
-- reparte y sigue la regla de la casa. Así que pedir carta o plantarse es
-- del lado A y de nadie más.
--
-- CONVENCIÓN: LADO A = JUGADOR, LADO B = HOST. No es arbitrario: en
-- `unirse_blackjack` el primero que llega se sienta siempre en A y el
-- segundo en B, así que el asiento ya está determinado antes de que nadie
-- toque un botón. El formulario de /bakery/titulos ahora rotula los dos
-- campos con eso para que no se publiquen al revés.
--
-- Se bloquea en SQL y no solo escondiendo el botón: esconder un control no
-- es una regla — el RPC es público para cualquiera con sesión, y una regla
-- que solo vive en el navegador no es una regla.
-- =============================================================================

create or replace function marcar_turno(
  p_usuario_id uuid,
  p_evento_id uuid,
  p_accion text
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_lado lado_apuesta;
  v_turno estado_turno;
begin
  if p_accion not in ('pedir', 'quedarse') then
    raise exception 'Acción inválida' using errcode = 'P0262';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Mesa no encontrada' using errcode = 'P0263';
  end if;
  if v_evento.categoria <> 'blackjack' then
    raise exception 'Esta mesa no es de blackjack' using errcode = 'P0264';
  end if;
  if v_evento.estado <> 'abierto' then
    raise exception 'Esta mano ya terminó' using errcode = 'P0265';
  end if;

  select lado into v_lado
  from apuestas
  where evento_id = p_evento_id
    and usuario_id = p_usuario_id
    and estado <> 'cancelada'
  limit 1;

  if v_lado is null then
    raise exception 'No estás sentado en esta mesa' using errcode = 'P0266';
  end if;

  -- El lado B es el host: su mano la juega quien reparte, siguiendo la
  -- regla de la casa. Quien apostó ahí no decide nada.
  if v_lado = 'b' then
    raise exception 'El lado del host no pide cartas' using errcode = 'P0268';
  end if;

  v_turno := v_evento.turno_a;
  if v_turno = 'quedado' then
    raise exception 'Ya te plantaste en esta mano' using errcode = 'P0267';
  end if;

  update eventos
    set turno_a = (case when p_accion = 'pedir' then 'pidiendo' else 'quedado' end)::estado_turno,
        cartas_a = cartas_a + (case when p_accion = 'pedir' then 1 else 0 end)
    where id = p_evento_id
    returning * into v_evento;

  return v_evento;
end;
$$;

revoke all on function marcar_turno(uuid, uuid, text) from public;
grant execute on function marcar_turno(uuid, uuid, text) to service_role;

comment on column eventos.turno_b is
  'Sin uso en blackjack (0040): el lado B es el host y su mano no se pide, se reparte. Queda siempre en esperando.';
