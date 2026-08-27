-- =============================================================================
-- LA PANCA — "Ajustar saldo" cuenta como depósito; el saldo fake no
-- 0042_ajuste_saldo_cuenta_como_deposito.sql
--
-- EL PROBLEMA. `admin_ajustar_saldo` (0024) subía el `saldo_disponible` de
-- un jugador y nada más. Eso rompía la reconciliación: el saldo del jugador
-- subía (y con él `saldos_usuarios_total`), pero `yape_esperado` no, porque
-- se calcula de recargas/retiros/pagos/ajustes_yape. El panel dejaba de
-- cuadrar y no había forma de saber por qué mirando los números.
--
-- LA REGLA NUEVA. Un ajuste de saldo REAL es plata que entró (o salió) del
-- sistema por fuera del flujo de recargas, así que cuenta igual que una
-- recarga: suma a lo depositado del día y a lo que debería haber en el
-- Yape. Un ajuste NEGATIVO resta, con el mismo criterio.
--
-- EL SALDO FAKE NO. `admin_dar_saldo_fake` (0036) escribe en la misma tabla
-- `ajustes_saldo` pero con `es_fake = true`, y esas filas se excluyen de
-- todo lo de acá — que es justamente el punto del saldo fake: no es plata.
--
-- SE CUENTA HACIA ATRÁS. Los ajustes que ya existían también entran. Es lo
-- correcto en el caso normal (nunca se compensaron a mano), pero OJO: si
-- alguna vez registraste un ajuste de Yape para compensar un ajuste de
-- saldo — que es lo que recomendaba la cabecera de 0024 — ahora estaría
-- contado dos veces. Revisa `select * from ajustes_yape;` y borra los que
-- eran compensaciones de un ajuste de saldo.
--
-- QUEDA IGUAL A PROPÓSITO: `requisito_retiro`. Ese requisito ("apuesta S/5
-- por cada recarga antes de retirar") existe contra el abuso de depositar y
-- sacar; un ajuste lo hace el staff a mano, así que no hay a quién frenar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- admin_metricas: los ajustes de saldo reales entran en `depositado_hoy` y
-- en `yape_esperado`, y se expone `ajustes_saldo_total` para que el panel
-- pueda mostrar de dónde sale el número. Cambia la firma → drop primero.
-- Reemplaza la versión de 0036.
-- ---------------------------------------------------------------------------

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
  ajustes_saldo_total numeric
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
    ), 0)::numeric;
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- admin_resumen_diario: los ajustes de saldo reales entran en el "Ingreso"
-- del día y en el movimiento de Yape de ese día. Cuerpo de 0038 + la CTE
-- `aju`. La firma no cambia, pero se DROPea igual por consistencia con las
-- versiones anteriores.
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
  yape_acumulado numeric
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
    + coalesce((select sum(saldo_nuevo - saldo_anterior) from ajustes_saldo
      where not es_fake
        and (created_at at time zone 'America/Lima')::date < p_desde), 0)
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
  -- Ajustes de saldo REALES: cuentan como depósito (0042). Los de saldo
  -- fake quedan fuera por el `not es_fake`.
  aju as (select (created_at at time zone 'America/Lima')::date as fecha, sum(saldo_nuevo - saldo_anterior) as monto
    from ajustes_saldo where not es_fake group by 1),
  apo as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto_total) as monto
    from apuestas where not es_fake group by 1),
  pag as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from movimientos_saldo where tipo = 'pago_ganancia' and not es_fake group by 1),
  com as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from comisiones_plataforma group by 1),
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
      coalesce(dep.monto, 0) + coalesce(aju.monto, 0) as depositado,
      coalesce(apo.monto, 0) as apostado,
      coalesce(pag.monto, 0) as pagado,
      coalesce(ret.monto, 0) as retirado,
      coalesce(com.monto, 0) as comision,
      coalesce(com.monto, 0) - coalesce(pmg.monto, 0) as ganancia_real,
      coalesce(dep.monto, 0) + coalesce(aju.monto, 0) - coalesce(ret.monto, 0)
        - coalesce(pm.monto, 0) + coalesce(aj.monto, 0) as delta_yape
    from dias
    left join dep on dep.fecha = dias.fecha
    left join aju on aju.fecha = dias.fecha
    left join apo on apo.fecha = dias.fecha
    left join pag on pag.fecha = dias.fecha
    left join com on com.fecha = dias.fecha
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
    acum.yape_acumulado::numeric
  from acum
  where acum.depositado + acum.apostado + acum.pagado + acum.retirado + acum.comision <> 0
     or acum.delta_yape <> 0
  order by acum.fecha desc;
end;
$$;

revoke all on function admin_resumen_diario(uuid, date, date) from public;
grant execute on function admin_resumen_diario(uuid, date, date) to service_role;
