-- =============================================================================
-- LA PANCA — Puntos por ganar bajan de 5 a 3
-- 0018_puntos_ganar_3.sql
--
-- Perder se queda en 1 punto, sin cambios. Se repite `liquidar_evento`
-- entera (mismo cuerpo de 0013_resolucion_en_dos_fases.sql) porque
-- `create or replace` reemplaza la función completa.
-- =============================================================================

create or replace function liquidar_evento(
  p_evento_id uuid,
  p_resultado lado_apuesta
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

  -- Liquida lo emparejado y reparte los puntos de progresión.
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
            puntos = puntos + 3
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

  select coalesce(round(sum(monto) * 0.20, 2), 0) into v_comision_total
  from emparejamientos
  where evento_id = p_evento_id;

  insert into comisiones_plataforma (evento_id, monto)
  values (p_evento_id, v_comision_total);
end;
$$;

revoke all on function liquidar_evento(uuid, lado_apuesta) from public;
grant execute on function liquidar_evento(uuid, lado_apuesta) to service_role;
