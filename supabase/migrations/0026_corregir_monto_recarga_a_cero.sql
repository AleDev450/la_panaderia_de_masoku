-- =============================================================================
-- LA PANCA — Permitir corregir una recarga a S/0 (era 100% falsa)
-- 0026_corregir_monto_recarga_a_cero.sql
--
-- 0025 no dejaba bajar a 0 porque `recargas.monto_acreditado` exige > 0.
-- En uso real hace falta: una recarga puede haber sido enteramente saldo
-- de prueba, no solo inflada. Ahora, si el monto corregido es 0, la
-- recarga pasa a `estado = 'rechazada'` y `monto_acreditado = null` —
-- limpio: NULL sí cumple el check (> 0 nunca es false contra NULL), y una
-- recarga rechazada mostrando "S/0 aprobada" habría sido confuso.
--
-- El saldo del jugador se sigue ajustando por la diferencia completa
-- (0 − lo que tenía acreditado), con la misma guarda de 0025: si ya no le
-- alcanza el disponible, se rechaza en vez de dejarlo en negativo.
-- =============================================================================

create or replace function admin_corregir_monto_recarga(
  p_admin_id uuid,
  p_recarga_id uuid,
  p_monto_nuevo numeric,
  p_motivo text
)
returns recargas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recarga recargas%rowtype;
  v_perfil perfiles%rowtype;
  v_anterior numeric(12, 2);
  v_delta numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede corregir recargas' using errcode = 'P0170';
  end if;
  if p_monto_nuevo is null or p_monto_nuevo < 0 then
    raise exception 'El monto no puede ser negativo' using errcode = 'P0171';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Indica el motivo de la corrección' using errcode = 'P0172';
  end if;

  select * into v_recarga from recargas where id = p_recarga_id for update;
  if not found then
    raise exception 'Recarga no encontrada' using errcode = 'P0173';
  end if;
  if v_recarga.estado <> 'aprobada' then
    raise exception 'Solo se puede corregir una recarga aprobada' using errcode = 'P0174';
  end if;

  p_monto_nuevo := round(p_monto_nuevo, 2);
  v_anterior := v_recarga.monto_acreditado;
  v_delta := p_monto_nuevo - v_anterior;

  select * into v_perfil from perfiles where id = v_recarga.usuario_id for update;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0175';
  end if;
  if v_perfil.saldo_disponible + v_delta < 0 then
    raise exception 'El jugador ya no tiene suficiente saldo disponible para esta corrección — le faltan S/%',
      round(abs(v_perfil.saldo_disponible + v_delta), 2)
      using errcode = 'P0176';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible + v_delta
    where id = v_recarga.usuario_id;

  if p_monto_nuevo = 0 then
    update recargas
      set monto_acreditado = null, estado = 'rechazada'
      where id = p_recarga_id
      returning * into v_recarga;
  else
    update recargas
      set monto_acreditado = p_monto_nuevo
      where id = p_recarga_id
      returning * into v_recarga;
  end if;

  insert into correcciones_recarga (admin_id, recarga_id, monto_anterior, monto_nuevo, motivo)
  values (p_admin_id, p_recarga_id, v_anterior, p_monto_nuevo, trim(p_motivo));

  return v_recarga;
end;
$$;

revoke all on function admin_corregir_monto_recarga(uuid, uuid, numeric, text) from public;
grant execute on function admin_corregir_monto_recarga(uuid, uuid, numeric, text) to service_role;
