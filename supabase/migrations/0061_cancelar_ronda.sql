-- =============================================================================
-- CACHUDOBET — Cancelar una ronda y devolverle a todos
-- 0061_cancelar_ronda.sql
--
-- Sirve para ruleta y para caballitos por igual: son la misma ronda con otro
-- `modo` (0058). Es el equivalente de "cancelar partida" del motor de apuestas
-- (0029): si la ronda se armó mal, se cayó el stream o simplemente no va a
-- correr, la plata vuelve y nadie queda con saldo trabado.
--
-- SOLO SE DEVUELVE LO QUE SE COBRÓ. `comprar_tickets_ruleta` descuenta del
-- saldo; `admin_agregar_tickets` NO —los tickets manuales son un regalo del
-- staff, entraron al pozo sin salir del bolsillo de nadie—. Devolver esos
-- sería crear plata: por eso el reembolso filtra por `manual = false`.
--
-- NO SE PUEDE CANCELAR UNA RONDA YA SORTEADA. Al girar, el premio ya se
-- acreditó y la comisión ya se contó como ganancia; "devolver" ahí significaría
-- quitarle el premio a alguien que ya lo cobró y probablemente ya lo apostó.
-- Para eso está el flujo normal de finalizar.
--
-- Los tickets NO se borran. Quedan como registro de qué se había comprado; lo
-- que cambia es el estado de la ronda y que la plata volvió. Un historial que
-- se borra a sí mismo no sirve para responder un reclamo.
-- =============================================================================

alter type estado_ronda_ruleta add value if not exists 'cancelada';

alter table ruleta_rondas
  add column if not exists cancelada_at timestamptz,
  add column if not exists cancelada_motivo text;

comment on column ruleta_rondas.cancelada_at is
  'Cuándo se canceló y se devolvió el pozo (0061). Null si nunca se canceló.';

-- ---------------------------------------------------------------------------
-- admin_cancelar_ronda
-- ---------------------------------------------------------------------------

create or replace function admin_cancelar_ronda(
  p_admin_id uuid,
  p_ronda_id uuid,
  p_motivo text
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda ruleta_rondas%rowtype;
  v_fila record;
  v_devuelto numeric(12, 2) := 0;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede cancelar una ronda' using errcode = 'P0330';
  end if;

  select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
  if not found then
    raise exception 'Ronda no encontrada' using errcode = 'P0331';
  end if;
  if v_ronda.ganador_ticket_id is not null then
    raise exception 'Esta ronda ya se sorteó y se pagó: no se puede cancelar'
      using errcode = 'P0332';
  end if;
  if v_ronda.estado = 'cancelada' then
    raise exception 'Esta ronda ya estaba cancelada' using errcode = 'P0333';
  end if;

  -- Una devolución por PERSONA, no por ticket: quien compró diez recibe un
  -- solo movimiento por el total, que es como lo va a leer en su historial.
  for v_fila in
    select usuario_id, sum(monto) as monto
    from ruleta_tickets
    where ronda_id = p_ronda_id
      and not manual
    group by usuario_id
  loop
    update perfiles
      set saldo_disponible = saldo_disponible + v_fila.monto
      where id = v_fila.usuario_id;

    insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
    values (v_fila.usuario_id, 'devolucion', v_fila.monto, false);

    v_devuelto := v_devuelto + v_fila.monto;
  end loop;

  update ruleta_rondas
    set estado = 'cancelada',
        cancelada_at = now(),
        cancelada_motivo = nullif(trim(coalesce(p_motivo, '')), ''),
        -- El pozo vuelve a cero porque ya no hay nada adentro: lo comprado se
        -- devolvió y lo manual nunca fue plata.
        pozo_total = 0
    where id = p_ronda_id
    returning * into v_ronda;

  raise notice 'Ronda % cancelada. Devuelto: S/%', v_ronda.numero, v_devuelto;
  return v_ronda;
end;
$$;

revoke all on function admin_cancelar_ronda(uuid, uuid, text) from public;
grant execute on function admin_cancelar_ronda(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- admin_eliminar_sorteo: el sorteo no mueve saldo, así que se puede borrar.
--
-- A diferencia de una ronda, acá no hay plata que devolver: los tickets del
-- sorteo los escribe el staff a mano y nunca salieron del saldo de nadie. Las
-- inscripciones y las carreras se van solas por `on delete cascade`.
-- ---------------------------------------------------------------------------

create or replace function admin_eliminar_sorteo(
  p_admin_id uuid,
  p_sorteo_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede eliminar un sorteo' using errcode = 'P0334';
  end if;

  delete from sorteos where id = p_sorteo_id;
  if not found then
    raise exception 'Sorteo no encontrado' using errcode = 'P0335';
  end if;
end;
$$;

revoke all on function admin_eliminar_sorteo(uuid, uuid) from public;
grant execute on function admin_eliminar_sorteo(uuid, uuid) to service_role;
