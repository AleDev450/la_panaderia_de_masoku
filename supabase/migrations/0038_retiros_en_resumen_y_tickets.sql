-- =============================================================================
-- LA PANCA — Retiros visibles en el día a día + tickets de sorteo
-- 0038_retiros_en_resumen_y_tickets.sql
--
-- 1. RETIROS EN EL RESUMEN DIARIO. El cuadro del mes tenía un agujero: un
--    día en que solo se pagó un retiro salía con TODO en cero y el único
--    rastro era que "Acum. Yape" bajaba solo (ej. 232.60 → 198.60 sin que
--    ninguna columna explicara los 34 que faltaban). El dato ya se
--    calculaba adentro — la CTE `ret` alimentaba `delta_yape` — pero nunca
--    se devolvía. Ahora sale como columna `retirado`.
--
--    Y con eso "Me queda" pasa a ser Ingreso − Se pagó − Retirado. Antes
--    ignoraba la plata que de verdad salió del Yape, que es justo lo que
--    hacía que un día de puro retiro se viera como un día sin movimiento.
--    OJO: esto CAMBIA el número de "Me queda" en los días que tuvieron
--    retiros; los totales del mes también.
--
--    Los pagos manuales siguen sin columna propia a propósito (su
--    historial está en /bakery/pagos). Si un día baja el acumulado y la
--    columna `retirado` está en cero, la diferencia es un pago manual o un
--    ajuste de Yape.
--
-- 2. TICKETS DE SORTEO. Cada inscripción lleva su número de tickets, que
--    el admin escribe a mano — el tier del bundle (brillante / holográfico
--    / dorado) se verifica por fuera, así que acá solo se guarda el
--    número. Con eso, `admin_sortear_ganador` elige al azar PONDERADO por
--    tickets: con 6 tickets tienes seis veces la chance de uno con 1.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. admin_resumen_diario + columna `retirado`. Cambia la firma de retorno,
--    así que se DROPea antes de recrear. Reemplaza la versión de 0036.
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
      coalesce(dep.monto, 0) as depositado,
      coalesce(apo.monto, 0) as apostado,
      coalesce(pag.monto, 0) as pagado,
      coalesce(ret.monto, 0) as retirado,
      coalesce(com.monto, 0) as comision,
      coalesce(com.monto, 0) - coalesce(pmg.monto, 0) as ganancia_real,
      coalesce(dep.monto, 0) - coalesce(ret.monto, 0)
        - coalesce(pm.monto, 0) + coalesce(aj.monto, 0) as delta_yape
    from dias
    left join dep on dep.fecha = dias.fecha
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

-- ---------------------------------------------------------------------------
-- 2. Tickets por inscripción.
--
-- Nace en 1 y no en 0: quien se inscribió ya está participando, y dejar el
-- default en 0 lo sacaría del sorteo sin que nadie lo note hasta que el
-- ganador salga de un universo más chico del que se creía.
-- ---------------------------------------------------------------------------

alter table inscripciones_sorteo
  add column if not exists tickets integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tickets_no_negativos') then
    alter table inscripciones_sorteo
      add constraint tickets_no_negativos check (tickets >= 0 and tickets <= 1000);
  end if;
end;
$$;

comment on column inscripciones_sorteo.tickets is
  'Cuántas chances tiene en el sorteo (0038). Lo escribe el admin a mano según el tier que compró; 0 = queda fuera del sorteo.';

create or replace function admin_asignar_tickets(
  p_admin_id uuid,
  p_inscripcion_id uuid,
  p_tickets integer
)
returns inscripciones_sorteo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inscripcion inscripciones_sorteo%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede asignar tickets' using errcode = 'P0240';
  end if;
  if p_tickets is null or p_tickets < 0 then
    raise exception 'Los tickets no pueden ser negativos' using errcode = 'P0241';
  end if;
  if p_tickets > 1000 then
    raise exception 'Máximo 1000 tickets por persona' using errcode = 'P0242';
  end if;

  update inscripciones_sorteo
    set tickets = p_tickets
    where id = p_inscripcion_id
    returning * into v_inscripcion;

  if not found then
    raise exception 'Inscripción no encontrada' using errcode = 'P0243';
  end if;

  return v_inscripcion;
end;
$$;

revoke all on function admin_asignar_tickets(uuid, uuid, integer) from public;
grant execute on function admin_asignar_tickets(uuid, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- admin_sortear_ganador: saca UN ganador al azar, ponderado por tickets.
--
-- El sorteo se hace acá y no en el navegador para que el resultado quede
-- escrito en la misma transacción en que se elige — desde el cliente,
-- cualquiera con la consola abierta puede volver a tirar hasta que salga
-- quien quiere.
--
-- La ponderación usa la clave `random() ^ (1 / tickets)` y se queda con la
-- más alta (Efraimidis–Spirakis): da probabilidad exactamente proporcional
-- a los tickets, en una sola pasada y sin armar la urna ticket por ticket.
--
-- Solo entran los que todavía NO son ganadores, así que apretar el botón
-- de nuevo saca un segundo ganador — que es lo que se quiere cuando hay
-- varios cofres para el mismo sorteo.
-- ---------------------------------------------------------------------------

create or replace function admin_sortear_ganador(
  p_admin_id uuid,
  p_sorteo_id uuid
)
returns inscripciones_sorteo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inscripcion inscripciones_sorteo%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede sortear' using errcode = 'P0250';
  end if;

  -- Elegir y marcar en una sola sentencia: si fueran dos, dos clics
  -- simultáneos podrían sacar a la misma persona dos veces.
  update inscripciones_sorteo
    set ganador = true
    where id = (
      select id
      from inscripciones_sorteo
      where sorteo_id = p_sorteo_id
        and not ganador
        and tickets > 0
      order by power(random(), 1.0 / tickets::float8) desc
      limit 1
    )
    returning * into v_inscripcion;

  if not found then
    raise exception 'No queda nadie con tickets para sortear' using errcode = 'P0251';
  end if;

  return v_inscripcion;
end;
$$;

revoke all on function admin_sortear_ganador(uuid, uuid) from public;
grant execute on function admin_sortear_ganador(uuid, uuid) to service_role;
