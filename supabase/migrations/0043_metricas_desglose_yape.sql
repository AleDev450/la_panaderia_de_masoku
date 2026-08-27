-- =============================================================================
-- LA PANCA — Desglose auditable del Yape: se exponen recargas y retiros
-- 0043_metricas_desglose_yape.sql
--
-- POR QUÉ. El panel explicaba "En Yape deberías tener" con esta línea:
--
--     = Ganancia + Saldos de jugadores − Pagos manuales + Ajustes
--
-- y esa identidad ES FALSA cuando hay pagos manuales que restan de la
-- ganancia (lo normal desde 0030): el pago se resta dos veces, una dentro
-- de `ganancia_total` y otra explícita. Con una recarga de 100, una
-- comisión de 10 y un pago de 20, `yape_esperado` da 80 y la línea armaba
-- 60.
--
-- La identidad correcta es incómoda de leer:
--
--     yape = ganancia + saldos + ajustes_yape − pagos_que_NO_restaron_de_ganancia
--
-- Así que en vez de arreglar la derivación se muestran los INSUMOS, que no
-- necesitan demostración: recargas + cargado a mano − retiros − pagos +
-- ajustes. Para eso faltaban dos totales, y es lo único que agrega esta
-- migración.
--
-- Y para "cuánto es mío", el panel pasa a usar `yape_esperado −
-- saldos_usuarios_total`: lo que queda si le pagas a todos. Eso siempre
-- cuadra, sin derivar nada. Ojo que NO es lo mismo que `ganancia_total`
-- (que es el resultado del negocio); se muestran los dos, separados.
--
-- Solo cambia la firma de admin_metricas. Reemplaza la versión de 0042.
-- =============================================================================

drop function if exists admin_metricas(uuid);

create or replace function admin_metricas(p_admin_id uuid)
returns table (
  depositado_hoy numeric,
  retirado_hoy numeric,
  pagado_hoy numeric,
  ganancia_hoy numeric,
  ganancia_total numeric,
  usuarios_total bigint,
  usuarios_baneados bigint,
  eventos_abiertos bigint,
  retiros_pendientes bigint,
  saldos_usuarios_total numeric,
  pagos_manuales_total numeric,
  ajustes_yape_total numeric,
  yape_esperado numeric,
  retiros_pagados_hoy bigint,
  saldo_fake_total numeric,
  ajustes_saldo_total numeric,
  recargas_total numeric,
  retiros_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Medianoche de Perú devuelta a timestamptz, para poder compararla con
  -- columnas timestamptz sin que el huso de la sesión meta la cola (0030).
  v_inicio_hoy timestamptz := date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima';
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0080';
  end if;

  return query
  select
    (
      coalesce((
        select sum(r.monto_acreditado) from recargas r
        where r.estado = 'aprobada' and r.revisado_at >= v_inicio_hoy
      ), 0)
      + coalesce((
        select sum(a.saldo_nuevo - a.saldo_anterior) from ajustes_saldo a
        where not a.es_fake and a.created_at >= v_inicio_hoy
      ), 0)
    )::numeric,
    coalesce((
      select sum(t.monto) from retiros t
      where t.estado = 'pagado' and t.revisado_at >= v_inicio_hoy
    ), 0)::numeric,
    coalesce((
      select sum(m.monto) from movimientos_saldo m
      where m.tipo = 'pago_ganancia' and not m.es_fake
        and m.created_at >= v_inicio_hoy
    ), 0)::numeric,
    (
      coalesce((
        select sum(c.monto) from comisiones_plataforma c
        where c.created_at >= v_inicio_hoy
      ), 0)
      - coalesce((
        select sum(p.monto) from pagos_manuales p
        where p.afecta_ganancia and p.created_at >= v_inicio_hoy
      ), 0)
    )::numeric,
    (
      coalesce((select sum(c.monto) from comisiones_plataforma c), 0)
      - coalesce((select sum(p.monto) from pagos_manuales p where p.afecta_ganancia), 0)
    )::numeric,
    (select count(*) from perfiles where rol = 'user'),
    (select count(*) from perfiles where rol = 'user' and baneado),
    (select count(*) from eventos where estado = 'abierto'),
    (select count(*) from retiros where estado = 'pendiente'),
    coalesce((
      select sum(saldo_disponible + saldo_retenido) from perfiles where rol = 'user'
    ), 0)::numeric,
    coalesce((select sum(monto) from pagos_manuales), 0)::numeric,
    coalesce((select sum(monto) from ajustes_yape), 0)::numeric,
    (
      coalesce((select sum(monto_acreditado) from recargas where estado = 'aprobada'), 0)
      + coalesce((select sum(saldo_nuevo - saldo_anterior) from ajustes_saldo where not es_fake), 0)
      - coalesce((select sum(monto) from retiros where estado = 'pagado'), 0)
      - coalesce((select sum(monto) from pagos_manuales), 0)
      + coalesce((select sum(monto) from ajustes_yape), 0)
    )::numeric,
    (
      select count(*) from retiros t
      where t.estado = 'pagado' and t.revisado_at >= v_inicio_hoy
    ),
    coalesce((
      select sum(saldo_fake + saldo_fake_retenido) from perfiles where rol = 'user'
    ), 0)::numeric,
    coalesce((
      select sum(saldo_nuevo - saldo_anterior) from ajustes_saldo where not es_fake
    ), 0)::numeric,
    coalesce((
      select sum(monto_acreditado) from recargas where estado = 'aprobada'
    ), 0)::numeric,
    coalesce((
      select sum(monto) from retiros where estado = 'pagado'
    ), 0)::numeric;
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;
