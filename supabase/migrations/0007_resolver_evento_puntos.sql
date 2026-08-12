-- =============================================================================
-- LA PANCA — Motor de emparejamiento de apuestas
-- 0007_resolver_evento_puntos.sql: `resolver_evento` ahora también reparte
-- los puntos de progresión (niveles / ranking).
--
-- Antes esto vivía en el demo mock de `/partidas` (MatchesContext llamaba a
-- `admin_otorgar_puntos` al resolver un título). Al migrar `/partidas` al
-- motor real ese camino desapareció y nadie otorgaba puntos, así que
-- `perfiles.puntos` se habría quedado en 0 para siempre. Ahora se reparten
-- dentro de la misma transacción que la liquidación del dinero:
--   - lado que acertó el resultado: +5
--   - lado que no: +1 (participar en un evento resuelto siempre puntúa)
-- Solo puntúan las apuestas que llegaron a emparejar algo (monto_matcheado
-- > 0); una orden que nunca encontró contraparte se devuelve entera y no
-- cuenta como participación.
-- =============================================================================

create or replace function resolver_evento(
  p_evento_id uuid,
  p_resultado lado_apuesta,
  p_admin_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_apuesta record;
  v_payout numeric(12, 2);
  v_comision_total numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede resolver un evento' using errcode = 'P0020';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0021';
  end if;
  if v_evento.estado = 'resuelto' then
    raise exception 'El evento ya fue resuelto' using errcode = 'P0022';
  end if;

  update eventos
    set estado = 'resuelto', resultado = p_resultado
    where id = p_evento_id;

  -- Devuelve todo lo no emparejado.
  for v_apuesta in
    select * from apuestas
    where evento_id = p_evento_id and monto_pendiente > 0
    for update
  loop
    update perfiles
      set saldo_disponible = saldo_disponible + v_apuesta.monto_pendiente,
          saldo_retenido = saldo_retenido - v_apuesta.monto_pendiente
      where id = v_apuesta.usuario_id;

    insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id)
    values (v_apuesta.usuario_id, 'devolucion', v_apuesta.monto_pendiente, v_apuesta.id, p_evento_id);

    update apuestas
      set monto_pendiente = 0,
          estado = (case when monto_matcheado > 0 then 'completa' else 'cancelada' end)::estado_apuesta
      where id = v_apuesta.id;
  end loop;

  -- Liquida lo emparejado: paga ganadores, libera retenido de todos, y
  -- otorga los puntos de progresión en el mismo recorrido.
  for v_apuesta in
    select * from apuestas
    where evento_id = p_evento_id and monto_matcheado > 0
    for update
  loop
    if v_apuesta.lado = p_resultado then
      v_payout := round(v_apuesta.monto_matcheado * 1.80, 2);

      update perfiles
        set saldo_disponible = saldo_disponible + v_payout,
            saldo_retenido = saldo_retenido - v_apuesta.monto_matcheado,
            puntos = puntos + 5
        where id = v_apuesta.usuario_id;

      insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id)
      values (v_apuesta.usuario_id, 'pago_ganancia', v_payout, v_apuesta.id, p_evento_id);
    else
      update perfiles
        set saldo_retenido = saldo_retenido - v_apuesta.monto_matcheado,
            puntos = puntos + 1
        where id = v_apuesta.usuario_id;
    end if;
  end loop;

  -- Comisión de plataforma: 0.20 por cada unidad de monto emparejado.
  select coalesce(round(sum(monto) * 0.20, 2), 0) into v_comision_total
  from emparejamientos
  where evento_id = p_evento_id;

  insert into comisiones_plataforma (evento_id, monto)
  values (p_evento_id, v_comision_total);
end;
$$;

revoke all on function resolver_evento(uuid, lado_apuesta, uuid) from public;
grant execute on function resolver_evento(uuid, lado_apuesta, uuid) to service_role;
