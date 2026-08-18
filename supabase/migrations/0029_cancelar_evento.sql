-- =============================================================================
-- LA PANCA — Cancelar un título por completo (imprevisto)
-- 0029_cancelar_evento.sql
--
-- Declarar/corregir/confirmar (0013) asume que el título SÍ se jugó y hay
-- que decidir un ganador. Esto es para cuando no se puede seguir con eso
-- del todo — se cayó el server, el título se creó mal, la partida real se
-- suspendió, etc. — y hay que devolverle su plata a todos como si la sala
-- nunca hubiera existido, sin ganador ni perdedor ni comisión.
--
-- Se puede cancelar en cualquier momento ANTES de confirmar el pago —
-- incluso con un resultado ya declarado (la ventana de corrección de 0013
-- es exactamente para "espera, algo está mal", así que cancelar tiene que
-- seguir disponible ahí). Una vez `resuelto` (ya pagado) ya no se puede:
-- para eso está la eliminación completa del título (0027/0028), que sí
-- revierte pagos ya hechos.
--
-- A diferencia de un `cancelar_apuesta` individual (que solo suelta lo NO
-- emparejado), acá se devuelve TODO — lo emparejado también — porque el
-- título entero se anula, no solo una apuesta.
-- =============================================================================

alter type estado_evento add value if not exists 'cancelado';

alter table eventos
  add column if not exists cancelado_motivo text;

create or replace function admin_cancelar_evento(
  p_admin_id uuid,
  p_evento_id uuid,
  p_motivo text default null
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_apuesta record;
  v_monto numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede cancelar un título' using errcode = 'P0200';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0201';
  end if;
  if v_evento.estado = 'resuelto' then
    raise exception 'El evento ya fue pagado, no se puede cancelar' using errcode = 'P0202';
  end if;
  if v_evento.estado = 'cancelado' then
    raise exception 'Este evento ya está cancelado' using errcode = 'P0203';
  end if;

  for v_apuesta in
    select * from apuestas
    where evento_id = p_evento_id and estado <> 'cancelada'
    for update
  loop
    v_monto := v_apuesta.monto_matcheado + v_apuesta.monto_pendiente;

    if v_monto > 0 then
      update perfiles
        set saldo_disponible = saldo_disponible + v_monto,
            saldo_retenido = saldo_retenido - v_monto
        where id = v_apuesta.usuario_id;

      insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id)
      values (v_apuesta.usuario_id, 'cancelacion', v_monto, v_apuesta.id, p_evento_id);
    end if;

    update apuestas
      set monto_matcheado = 0,
          monto_pendiente = 0,
          estado = 'cancelada'
      where id = v_apuesta.id;
  end loop;

  update eventos
    set estado = 'cancelado',
        cancelado_motivo = nullif(trim(coalesce(p_motivo, '')), ''),
        resultado_preliminar = null,
        declarado_at = null
    where id = p_evento_id
    returning * into v_evento;

  return v_evento;
end;
$$;

revoke all on function admin_cancelar_evento(uuid, uuid, text) from public;
grant execute on function admin_cancelar_evento(uuid, uuid, text) to service_role;
