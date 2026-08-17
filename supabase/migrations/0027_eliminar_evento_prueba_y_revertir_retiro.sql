-- =============================================================================
-- LA PANCA — Eliminar un título de prueba ya resuelto + revertir un retiro
-- 0027_eliminar_evento_prueba_y_revertir_retiro.sql
--
-- 1. admin_eliminar_evento_prueba: borra un título YA RESUELTO junto con
--    todo lo que generó (apuestas, emparejamientos, movimientos de saldo,
--    comisión), y revierte su efecto en el saldo/puntos de cada jugador
--    que apostó ahí — como si esa partida nunca hubiera existido.
--
--    La reversión no necesita tratar aparte lo no emparejado (ya se había
--    devuelto al resolver, así que su efecto neto ya es 0) — solo lo
--    emparejado importa:
--      perdedor: se le devuelve monto_matcheado (eso fue lo único que
--                perdió de verdad).
--      ganador:  se le quita el pago (matcheado × 1.80) y se le devuelve
--                lo que había arriesgado (monto_matcheado) — neto: se le
--                resta la ganancia que le había tocado.
--    y se le bajan los puntos que ganó esa apuesta (3 si ganó, 1 si
--    perdió), sin pasar de 0.
--
--    Solo para títulos `resuelto` — uno abierto o cerrado sin resultado
--    se borra con el camino normal (no mueve dinero, no hace falta esta
--    reversión).
--
-- 2. admin_revertir_retiro: un retiro ya 'pagado' puede haber salido de
--    plata que resultó ser de prueba (ej. financiada por el título que se
--    acaba de borrar arriba). Le devuelve el monto al jugador y lo pasa a
--    'rechazado' con el motivo — reutiliza `motivo_rechazo`, que ya
--    existe en `retiros`, en vez de crear una tabla de auditoría nueva.
-- =============================================================================

create or replace function admin_eliminar_evento_prueba(
  p_admin_id uuid,
  p_evento_id uuid
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
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede eliminar un título' using errcode = 'P0190';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0191';
  end if;
  if v_evento.estado <> 'resuelto' then
    raise exception 'Solo se puede eliminar así un título ya resuelto' using errcode = 'P0192';
  end if;

  for v_apuesta in
    select * from apuestas where evento_id = p_evento_id and monto_matcheado > 0
    for update
  loop
    if v_apuesta.lado = v_evento.resultado then
      v_payout := round(v_apuesta.monto_matcheado * 1.80, 2);
      update perfiles
        set saldo_disponible = saldo_disponible - v_payout + v_apuesta.monto_matcheado,
            puntos = greatest(0, puntos - 3)
        where id = v_apuesta.usuario_id;
    else
      update perfiles
        set saldo_disponible = saldo_disponible + v_apuesta.monto_matcheado,
            puntos = greatest(0, puntos - 1)
        where id = v_apuesta.usuario_id;
    end if;
  end loop;

  delete from emparejamientos where evento_id = p_evento_id;
  delete from movimientos_saldo where evento_id = p_evento_id;
  delete from comisiones_plataforma where evento_id = p_evento_id;
  delete from apuestas where evento_id = p_evento_id;
  delete from eventos where id = p_evento_id;
end;
$$;

revoke all on function admin_eliminar_evento_prueba(uuid, uuid) from public;
grant execute on function admin_eliminar_evento_prueba(uuid, uuid) to service_role;

create or replace function admin_revertir_retiro(
  p_admin_id uuid,
  p_retiro_id uuid,
  p_motivo text
)
returns retiros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retiro retiros%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede revertir retiros' using errcode = 'P0180';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Indica el motivo de la reversión' using errcode = 'P0181';
  end if;

  select * into v_retiro from retiros where id = p_retiro_id for update;
  if not found then
    raise exception 'Retiro no encontrado' using errcode = 'P0182';
  end if;
  if v_retiro.estado <> 'pagado' then
    raise exception 'Solo se puede revertir un retiro ya pagado' using errcode = 'P0183';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible + v_retiro.monto
    where id = v_retiro.usuario_id;

  update retiros
    set estado = 'rechazado', motivo_rechazo = trim(p_motivo)
    where id = p_retiro_id
    returning * into v_retiro;

  return v_retiro;
end;
$$;

revoke all on function admin_revertir_retiro(uuid, uuid, text) from public;
grant execute on function admin_revertir_retiro(uuid, uuid, text) to service_role;
