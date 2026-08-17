-- =============================================================================
-- LA PANCA — admin_eliminar_evento_prueba no debe dejar saldos negativos
-- 0028_eliminar_evento_prueba_sin_negativos.sql
--
-- 0027 restaba la ganancia del jugador sin chequear si todavía la tenía —
-- `perfiles.saldo_disponible` exige >= 0 (0001), así que si ya se la había
-- gastado o retirado, el UPDATE fallaba con un error crudo de Postgres en
-- vez de algo entendible. Caso real detectado antes de aplicar esto: al
-- intentar borrar "PRUEBA REAL"/"PRUEBA DE STREAM", el ganador de esas dos
-- ya tenía saldo_disponible en 0 — la reversión le habría pedido -44.
--
-- Esta es una herramienta de limpieza de datos de prueba, no un intento de
-- perseguir esa plata — así que en vez de bloquear toda la eliminación
-- por un jugador que ya no tiene cómo devolver la ganancia, se le deja en
-- 0 (se acepta la pérdida en ese caso puntual) y se sigue con el resto.
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
  v_perfil perfiles%rowtype;
  v_payout numeric(12, 2);
  v_delta numeric(12, 2);
  v_puntos_delta integer;
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
    select * into v_perfil from perfiles where id = v_apuesta.usuario_id for update;

    if v_apuesta.lado = v_evento.resultado then
      v_payout := round(v_apuesta.monto_matcheado * 1.80, 2);
      v_delta := v_apuesta.monto_matcheado - v_payout;
      v_puntos_delta := 3;
    else
      v_delta := v_apuesta.monto_matcheado;
      v_puntos_delta := 1;
    end if;

    update perfiles
      -- greatest(0, ...) en vez de bloquear todo el borrado: es limpieza
      -- de datos de prueba, no cobranza — si el jugador ya no tiene la
      -- ganancia (se la gastó o retiró), se acepta la pérdida acá.
      set saldo_disponible = greatest(0, saldo_disponible + v_delta),
          puntos = greatest(0, puntos - v_puntos_delta)
      where id = v_apuesta.usuario_id;
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
