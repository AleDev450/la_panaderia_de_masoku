-- =============================================================================
-- LA PANCA — Resumen día a día para el dashboard (y la descarga a Excel)
-- 0034_resumen_diario.sql
--
-- Devuelve, por cada día CALENDARIO DE PERÚ (America/Lima) dentro del rango,
-- los números que el panel muestra en un cuadro y exporta a CSV:
--   depositado : recargas aprobadas ese día (lo que ingresó).
--   apostado   : cuánto apostaron ese día (monto total de las apuestas).
--   pagado     : premios pagados a ganadores ese día.
--   comision   : la ganancia de la plataforma ese día (0.20 por unidad
--                emparejada, tal como la registra la liquidación).
-- El "me queda" (ingreso − pagado) se arma en el cliente a partir de esto.
--
-- Solo salen los días con algún movimiento, del más reciente al más viejo.
-- El agrupamiento usa `at time zone 'America/Lima'` para cortar el día donde
-- corresponde (no a la medianoche UTC).
-- =============================================================================

create or replace function admin_resumen_diario(
  p_admin_id uuid,
  p_desde date,
  p_hasta date
)
returns table (
  fecha date,
  depositado numeric,
  apostado numeric,
  pagado numeric,
  comision numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0080';
  end if;

  return query
  with dias as (
    select d::date as fecha
    from generate_series(p_desde, p_hasta, interval '1 day') d
  ),
  dep as (
    select (revisado_at at time zone 'America/Lima')::date as fecha,
           sum(monto_acreditado) as monto
    from recargas
    where estado = 'aprobada' and revisado_at is not null
    group by 1
  ),
  apo as (
    select (created_at at time zone 'America/Lima')::date as fecha,
           sum(monto_total) as monto
    from apuestas
    group by 1
  ),
  pag as (
    select (created_at at time zone 'America/Lima')::date as fecha,
           sum(monto) as monto
    from movimientos_saldo
    where tipo = 'pago_ganancia'
    group by 1
  ),
  com as (
    select (created_at at time zone 'America/Lima')::date as fecha,
           sum(monto) as monto
    from comisiones_plataforma
    group by 1
  )
  select
    dias.fecha,
    coalesce(dep.monto, 0)::numeric,
    coalesce(apo.monto, 0)::numeric,
    coalesce(pag.monto, 0)::numeric,
    coalesce(com.monto, 0)::numeric
  from dias
  left join dep on dep.fecha = dias.fecha
  left join apo on apo.fecha = dias.fecha
  left join pag on pag.fecha = dias.fecha
  left join com on com.fecha = dias.fecha
  where coalesce(dep.monto, 0) + coalesce(apo.monto, 0)
      + coalesce(pag.monto, 0) + coalesce(com.monto, 0) > 0
  order by dias.fecha desc;
end;
$$;

revoke all on function admin_resumen_diario(uuid, date, date) from public;
grant execute on function admin_resumen_diario(uuid, date, date) to service_role;
