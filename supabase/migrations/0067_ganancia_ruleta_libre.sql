-- =============================================================================
-- CACHUDOBET — La ruleta libre entra en las ganancias (y el total deja de
-- depender de que alguien se acuerde)
-- 0067_ganancia_ruleta_libre.sql
--
-- EL BUG. 0062 armó el desglose sumando modo por modo: `'ruleta'` por un lado,
-- `'carrera'` por el otro. 0064 agregó el modo `'libre'` y nadie volvió a
-- tocar las métricas, así que la comisión de las ruletas libres no aparecía en
-- ninguna línea del panel — y, peor, TAMPOCO EN EL TOTAL. La ganancia estaba
-- subcontada y lo iba a estar más con cada ruleta libre que se corriera.
--
-- EL ARREGLO DE FONDO, no solo el parche. El total ya no se calcula sumando
-- los modos conocidos uno por uno, sino tomando TODAS las rondas sorteadas sin
-- filtrar. El desglose sigue nombrando cada modo para poder mirarlos aparte,
-- pero dejó de ser la fuente del total.
--
-- La diferencia importa: si mañana se agrega un cuarto modo y nadie actualiza
-- esta función, ese juego no tendrá su línea propia —se verá en el total sin
-- desglosar— pero el dinero NO va a desaparecer del reporte. Antes sí
-- desaparecía, y en silencio.
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
  retiros_total numeric,
  ingresos_manuales_total numeric,
  ganancia_partidas_hoy numeric,
  ganancia_partidas_total numeric,
  ganancia_ruleta_hoy numeric,
  ganancia_ruleta_total numeric,
  ganancia_cara_sello_hoy numeric,
  ganancia_cara_sello_total numeric,
  pagos_personal_hoy numeric,
  pagos_personal_total numeric,
  ganancia_caballitos_hoy numeric,
  ganancia_caballitos_total numeric,
  -- Nuevo en 0067.
  ganancia_libre_hoy numeric,
  ganancia_libre_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio_hoy timestamptz := date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima';
  v_partidas_hoy numeric;
  v_partidas_total numeric;
  v_ruleta_hoy numeric;
  v_ruleta_total numeric;
  v_libre_hoy numeric;
  v_libre_total numeric;
  v_caballos_hoy numeric;
  v_caballos_total numeric;
  -- TODAS las rondas, sin mirar el modo. Es lo que entra al total.
  v_rondas_hoy numeric;
  v_rondas_total numeric;
  v_moneda_hoy numeric;
  v_moneda_total numeric;
  v_personal_hoy numeric;
  v_personal_total numeric;
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0080';
  end if;

  select coalesce(sum(c.monto) filter (where c.created_at >= v_inicio_hoy), 0),
         coalesce(sum(c.monto), 0)
    into v_partidas_hoy, v_partidas_total
  from comisiones_plataforma c;

  select
    -- El total: todas las rondas, venga el modo que venga.
    coalesce(sum(r.comision_monto) filter (where r.girada_at >= v_inicio_hoy), 0),
    coalesce(sum(r.comision_monto), 0),
    -- Y el desglose, solo para poder mirarlos por separado.
    coalesce(sum(r.comision_monto) filter (
      where r.modo = 'ruleta' and r.girada_at >= v_inicio_hoy), 0),
    coalesce(sum(r.comision_monto) filter (where r.modo = 'ruleta'), 0),
    coalesce(sum(r.comision_monto) filter (
      where r.modo = 'libre' and r.girada_at >= v_inicio_hoy), 0),
    coalesce(sum(r.comision_monto) filter (where r.modo = 'libre'), 0),
    coalesce(sum(r.comision_monto) filter (
      where r.modo = 'carrera' and r.girada_at >= v_inicio_hoy), 0),
    coalesce(sum(r.comision_monto) filter (where r.modo = 'carrera'), 0)
    into
      v_rondas_hoy, v_rondas_total,
      v_ruleta_hoy, v_ruleta_total,
      v_libre_hoy, v_libre_total,
      v_caballos_hoy, v_caballos_total
  from ruleta_rondas r
  where r.comision_monto is not null;

  select coalesce(sum(j.monto - j.pago) filter (where j.created_at >= v_inicio_hoy), 0),
         coalesce(sum(j.monto - j.pago), 0)
    into v_moneda_hoy, v_moneda_total
  from cara_sello_jugadas j;

  select coalesce(sum(p.monto) filter (where p.created_at >= v_inicio_hoy), 0),
         coalesce(sum(p.monto), 0)
    into v_personal_hoy, v_personal_total
  from pagos_manuales p
  where p.afecta_ganancia;

  return query
  select
    (
      coalesce((
        select sum(r.monto_acreditado) from recargas r
        where r.estado = 'aprobada' and r.revisado_at >= v_inicio_hoy
      ), 0)
      + coalesce((
        select sum(i.monto) from ingresos_manuales i
        where i.created_at >= v_inicio_hoy
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
    -- `v_rondas_*` y no la suma de los modos: así un modo nuevo sin línea
    -- propia sigue contando.
    (v_partidas_hoy + v_rondas_hoy + v_moneda_hoy - v_personal_hoy)::numeric,
    (v_partidas_total + v_rondas_total + v_moneda_total - v_personal_total)::numeric,
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
      + coalesce((select sum(monto) from ingresos_manuales), 0)
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
    coalesce((select sum(monto_acreditado) from recargas where estado = 'aprobada'), 0)::numeric,
    coalesce((select sum(monto) from retiros where estado = 'pagado'), 0)::numeric,
    coalesce((select sum(monto) from ingresos_manuales), 0)::numeric,
    v_partidas_hoy::numeric,
    v_partidas_total::numeric,
    v_ruleta_hoy::numeric,
    v_ruleta_total::numeric,
    v_moneda_hoy::numeric,
    v_moneda_total::numeric,
    v_personal_hoy::numeric,
    v_personal_total::numeric,
    v_caballos_hoy::numeric,
    v_caballos_total::numeric,
    v_libre_hoy::numeric,
    v_libre_total::numeric;
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- admin_resumen_diario: mismo arreglo en el cuadro día a día.
--
-- `comision` pasa a ser la de TODAS las rondas más partidas y moneda; el
-- desglose por juego sigue al lado, ahora con la ruleta libre incluida.
-- ---------------------------------------------------------------------------

drop function if exists admin_resumen_diario(uuid, date, date);

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
  retirado numeric,
  comision numeric,
  ganancia_real numeric,
  yape_acumulado numeric,
  comision_partidas numeric,
  comision_ruleta numeric,
  comision_cara_sello numeric,
  comision_caballitos numeric,
  comision_libre numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base numeric;
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0080';
  end if;

  select
    coalesce((select sum(monto_acreditado) from recargas
      where estado = 'aprobada' and revisado_at is not null
        and (revisado_at at time zone 'America/Lima')::date < p_desde), 0)
    + coalesce((select sum(monto) from ingresos_manuales
      where (created_at at time zone 'America/Lima')::date < p_desde), 0)
    - coalesce((select sum(monto) from retiros
      where estado = 'pagado' and revisado_at is not null
        and (revisado_at at time zone 'America/Lima')::date < p_desde), 0)
    - coalesce((select sum(monto) from pagos_manuales
      where (created_at at time zone 'America/Lima')::date < p_desde), 0)
    + coalesce((select sum(monto) from ajustes_yape
      where (created_at at time zone 'America/Lima')::date < p_desde), 0)
  into v_base;

  return query
  with dias as (
    select d::date as fecha
    from generate_series(p_desde, p_hasta, interval '1 day') d
  ),
  dep as (select (revisado_at at time zone 'America/Lima')::date as fecha, sum(monto_acreditado) as monto
    from recargas where estado = 'aprobada' and revisado_at is not null group by 1),
  ing as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from ingresos_manuales group by 1),
  apo as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto_total) as monto
    from apuestas where not es_fake group by 1),
  pag as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from movimientos_saldo where tipo = 'pago_ganancia' and not es_fake group by 1),
  com as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from comisiones_plataforma group by 1),
  -- Todas las rondas juntas: es lo que entra en `comision`.
  ron as (select (girada_at at time zone 'America/Lima')::date as fecha, sum(comision_monto) as monto
    from ruleta_rondas
    where comision_monto is not null and girada_at is not null group by 1),
  rul as (select (girada_at at time zone 'America/Lima')::date as fecha, sum(comision_monto) as monto
    from ruleta_rondas
    where comision_monto is not null and girada_at is not null and modo = 'ruleta' group by 1),
  lib as (select (girada_at at time zone 'America/Lima')::date as fecha, sum(comision_monto) as monto
    from ruleta_rondas
    where comision_monto is not null and girada_at is not null and modo = 'libre' group by 1),
  cab as (select (girada_at at time zone 'America/Lima')::date as fecha, sum(comision_monto) as monto
    from ruleta_rondas
    where comision_monto is not null and girada_at is not null and modo = 'carrera' group by 1),
  mon as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto - pago) as monto
    from cara_sello_jugadas group by 1),
  pmg as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from pagos_manuales where afecta_ganancia group by 1),
  ret as (select (revisado_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from retiros where estado = 'pagado' and revisado_at is not null group by 1),
  pm as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from pagos_manuales group by 1),
  aj as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from ajustes_yape group by 1),
  filas as (
    select
      dias.fecha,
      coalesce(dep.monto, 0) + coalesce(ing.monto, 0) as depositado,
      coalesce(apo.monto, 0) as apostado,
      coalesce(pag.monto, 0) as pagado,
      coalesce(ret.monto, 0) as retirado,
      coalesce(com.monto, 0) as comision_partidas,
      coalesce(rul.monto, 0) as comision_ruleta,
      coalesce(mon.monto, 0) as comision_cara_sello,
      coalesce(cab.monto, 0) as comision_caballitos,
      coalesce(lib.monto, 0) as comision_libre,
      coalesce(com.monto, 0) + coalesce(ron.monto, 0) + coalesce(mon.monto, 0) as comision,
      coalesce(com.monto, 0) + coalesce(ron.monto, 0) + coalesce(mon.monto, 0)
        - coalesce(pmg.monto, 0) as ganancia_real,
      coalesce(dep.monto, 0) + coalesce(ing.monto, 0) - coalesce(ret.monto, 0)
        - coalesce(pm.monto, 0) + coalesce(aj.monto, 0) as delta_yape
    from dias
    left join dep on dep.fecha = dias.fecha
    left join ing on ing.fecha = dias.fecha
    left join apo on apo.fecha = dias.fecha
    left join pag on pag.fecha = dias.fecha
    left join com on com.fecha = dias.fecha
    left join ron on ron.fecha = dias.fecha
    left join rul on rul.fecha = dias.fecha
    left join lib on lib.fecha = dias.fecha
    left join cab on cab.fecha = dias.fecha
    left join mon on mon.fecha = dias.fecha
    left join pmg on pmg.fecha = dias.fecha
    left join ret on ret.fecha = dias.fecha
    left join pm on pm.fecha = dias.fecha
    left join aj on aj.fecha = dias.fecha
  ),
  acum as (
    select
      filas.*,
      v_base + sum(delta_yape) over (
        order by filas.fecha rows between unbounded preceding and current row
      ) as yape_acumulado
    from filas
  )
  select
    acum.fecha,
    acum.depositado::numeric,
    acum.apostado::numeric,
    acum.pagado::numeric,
    acum.retirado::numeric,
    acum.comision::numeric,
    acum.ganancia_real::numeric,
    acum.yape_acumulado::numeric,
    acum.comision_partidas::numeric,
    acum.comision_ruleta::numeric,
    acum.comision_cara_sello::numeric,
    acum.comision_caballitos::numeric,
    acum.comision_libre::numeric
  from acum
  where acum.depositado + acum.apostado + acum.pagado + acum.retirado + acum.comision <> 0
     or acum.delta_yape <> 0
  order by acum.fecha desc;
end;
$$;

revoke all on function admin_resumen_diario(uuid, date, date) from public;
grant execute on function admin_resumen_diario(uuid, date, date) to service_role;
