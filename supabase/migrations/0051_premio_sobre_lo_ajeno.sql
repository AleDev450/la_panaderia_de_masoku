-- =============================================================================
-- CACHUDOBET — La comisión se cobra sobre la plata de los PERDEDORES
-- 0051_premio_sobre_lo_ajeno.sql
--
-- EL PROBLEMA QUE ARREGLA. Hasta 0048 el premio era el 80% del pozo ENTERO,
-- incluida la plata que puso el propio ganador. Consecuencia: el que ponía
-- más se cobraba comisión a sí mismo, y si su aporte pasaba el 80% del pozo
-- PERDÍA PLATA GANANDO.
--
--   Ronda real: A pone S/39 (13 tickets), B pone S/3 (1 ticket). Pozo S/42.
--     Antes:  gane quien gane el premio era S/33.60.
--             Si ganaba A cobraba 33.60 habiendo puesto 39 → −S/5.40.
--     Ahora:  si gana A cobra 39 + 80% de 3 = S/41.40  → +S/2.40.
--             si gana B cobra  3 + 80% de 39 = S/34.20 → +S/31.20.
--
-- LA REGLA NUEVA, EN UNA FRASE: recuperas lo tuyo y te llevas el 80% de lo
-- que pusieron los demás. La casa cobra su 20% solo sobre la plata que se
-- perdió, que es lo que cualquiera entiende por "comisión".
--
--   premio   = aporte_del_ganador + (pozo − aporte_del_ganador) * pct / 100
--   comision = pozo − premio      = (pozo − aporte_del_ganador) * (1 − pct/100)
--
-- DOS COSAS QUE SIGUEN GARANTIZADAS:
--   1. Nadie puede perder ganando: `premio >= aporte_del_ganador` siempre,
--      porque lo que se le suma nunca es negativo.
--   2. La casa NUNCA arriesga plata propia: `comision >= 0` siempre, porque
--      el aporte del ganador nunca puede ser mayor que el pozo. Sale de
--      dinero que ya está adentro.
--
-- LO QUE CAMBIA PARA EL NEGOCIO. La comisión deja de ser fija y pasa a
-- depender de quién gane. En rondas parejas se cobra casi lo mismo que antes
-- —con N jugadores iguales, (N−1)/N de lo de antes—. Donde se cobra menos es
-- en las rondas dominadas por un jugador grande… que son justo las que hoy
-- están rotas, y que ese jugador iba a dejar de jugar apenas sacara la cuenta.
--
-- Con UN solo participante el premio es exactamente su plata de vuelta y la
-- casa cobra 0. Es lo correcto: no hay a quién ganarle.
--
-- `porcentaje_premio` de la ronda no cambia de valor, cambia de SIGNIFICADO:
-- ya no es "% del pozo" sino "% de lo ajeno". Las rondas ya finalizadas no se
-- tocan — guardan `premio_monto` y `comision_monto` calculados con la regla
-- vieja, que es con la que se jugaron.
-- =============================================================================

create or replace function admin_girar_ruleta(
  p_admin_id uuid,
  p_ronda_id uuid
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda ruleta_rondas%rowtype;
  v_ticket ruleta_tickets%rowtype;
  v_aporte_ganador numeric(12, 2);
  v_premio numeric(12, 2);
  v_comision numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede girar la ruleta' using errcode = 'P0350';
  end if;

  select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
  if not found then
    raise exception 'Ronda no encontrada' using errcode = 'P0351';
  end if;
  if v_ronda.ganador_ticket_id is not null then
    raise exception 'Esta ronda ya se giró' using errcode = 'P0352';
  end if;
  if v_ronda.estado <> 'cerrada' then
    raise exception 'Cierra la ronda antes de girar' using errcode = 'P0353';
  end if;

  -- Uniforme sobre las filas: cada ticket es una fila, así que tener más
  -- tickets ES tener más chances.
  select * into v_ticket
  from ruleta_tickets
  where ronda_id = p_ronda_id
  order by random()
  limit 1;

  if not found then
    raise exception 'No hay tickets en esta ronda' using errcode = 'P0354';
  end if;

  -- Todo lo que puso el ganador en ESTA ronda, sumando sus tickets. Incluye
  -- los que el admin le agregó a mano: también entraron al pozo.
  select coalesce(sum(monto), 0) into v_aporte_ganador
  from ruleta_tickets
  where ronda_id = p_ronda_id
    and usuario_id = v_ticket.usuario_id;

  -- Lo suyo vuelve entero; la comisión se cobra solo sobre lo ajeno.
  v_premio := round(
    v_aporte_ganador
      + (v_ronda.pozo_total - v_aporte_ganador) * v_ronda.porcentaje_premio / 100,
    2
  );
  -- La comisión es el RESTO, no un segundo redondeo: así las dos partes
  -- siempre suman exactamente el pozo.
  v_comision := v_ronda.pozo_total - v_premio;

  if v_premio > 0 then
    update perfiles
      set saldo_disponible = saldo_disponible + v_premio
      where id = v_ticket.usuario_id;

    insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
    values (v_ticket.usuario_id, 'premio_ruleta', v_premio, false);
  end if;

  update ruleta_rondas
    set estado = 'girando',
        ganador_ticket_id = v_ticket.id,
        ganador_usuario_id = v_ticket.usuario_id,
        premio_monto = v_premio,
        comision_monto = v_comision,
        girada_at = now(),
        giro_inicia_en = now() + interval '3 seconds'
    where id = p_ronda_id
    returning * into v_ronda;

  return v_ronda;
end;
$$;

revoke all on function admin_girar_ruleta(uuid, uuid) from public;
grant execute on function admin_girar_ruleta(uuid, uuid) to service_role;

comment on column ruleta_rondas.porcentaje_premio is
  'Qué porcentaje de LO AJENO se lleva el ganador (0051). Su propio aporte lo recupera entero aparte. Antes de 0051 era el porcentaje del pozo entero.';
