-- =============================================================================
-- LA PANCA — Ingresos del día: plata que entra sin pasar por una recarga
-- 0044_ingresos_manuales.sql
--
-- PARA QUÉ. No toda la plata entra por el flujo de recargas: alguien te
-- paga en efectivo y le cargas el saldo a mano. Eso es un ingreso igual que
-- una recarga aprobada, pero hasta ahora no había dónde registrarlo con su
-- concepto, así que se hacía con "Ajustar saldo" y quedaba sin rastro de
-- por qué.
--
-- ESTO REEMPLAZA LA REGLA DE 0042. Ahí hice que la diferencia de un ajuste
-- de saldo contara como depósito. Con este módulo eso pasa a ser un
-- problema: si el mismo dinero se registra como ingreso Y como ajuste,
-- queda contado dos veces. Así que `ajustes_saldo` deja de sumar al ingreso
-- y al total esperado, y vuelve a ser lo que era — una corrección.
--
-- Y la cuenta sigue cerrando igual, porque "lo tuyo" se calcula como
-- `total_esperado − saldos_de_jugadores` (0043): un ajuste que le regala
-- saldo a alguien sube los saldos sin subir el total, así que sale
-- automáticamente de tu lado. Que es exactamente lo que es: un regalo.
--
-- YAPE Y EFECTIVO VAN JUNTOS, a pedido. `yape_esperado` deja de ser "lo que
-- hay en el teléfono" y pasa a ser "lo que deberías tener entre el Yape y
-- el efectivo". El nombre de la columna se mantiene para no arrastrar un
-- rename por medio código; la etiqueta en pantalla sí cambia.
--
-- ACREDITA EN LA MISMA TRANSACCIÓN. Si el ingreso viene con un jugador, se
-- le suma el saldo acá mismo. Dos pasos separados (registrar y luego
-- ajustar) es justo lo que lleva al doble conteo.
-- =============================================================================

create table if not exists ingresos_manuales (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references perfiles (id),
  concepto text not null,
  monto numeric(12, 2) not null check (monto > 0),
  -- A quién se le acreditó el saldo. Null = plata que entró y no le dio
  -- saldo a nadie (te la pagaron a ti por algo).
  usuario_id uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_ingresos_manuales_created on ingresos_manuales (created_at desc);
create index if not exists idx_ingresos_manuales_usuario on ingresos_manuales (usuario_id, created_at desc);

alter table ingresos_manuales enable row level security;

drop policy if exists ingresos_manuales_select_admin on ingresos_manuales;
create policy ingresos_manuales_select_admin
  on ingresos_manuales
  for select using (es_admin(auth.uid()));

comment on table ingresos_manuales is
  'Plata que entró sin pasar por el flujo de recargas (0044) — efectivo, transferencia, etc. Cuenta como ingreso del día y sube el total esperado.';

create or replace function admin_registrar_ingreso(
  p_admin_id uuid,
  p_concepto text,
  p_monto numeric,
  p_usuario_id uuid default null
)
returns ingresos_manuales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingreso ingresos_manuales%rowtype;
  v_perfil perfiles%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede registrar ingresos' using errcode = 'P0280';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0281';
  end if;
  if p_concepto is null or trim(p_concepto) = '' then
    raise exception 'Indica de dónde vino la plata' using errcode = 'P0282';
  end if;

  if p_usuario_id is not null then
    select * into v_perfil from perfiles where id = p_usuario_id for update;
    if not found then
      raise exception 'Usuario no encontrado' using errcode = 'P0283';
    end if;
    if v_perfil.rol = 'admin' then
      raise exception 'Un administrador no tiene saldo de juego' using errcode = 'P0284';
    end if;

    update perfiles
      set saldo_disponible = saldo_disponible + round(p_monto, 2)
      where id = p_usuario_id;
  end if;

  insert into ingresos_manuales (admin_id, concepto, monto, usuario_id)
  values (p_admin_id, trim(p_concepto), round(p_monto, 2), p_usuario_id)
  returning * into v_ingreso;

  return v_ingreso;
end;
$$;

revoke all on function admin_registrar_ingreso(uuid, text, numeric, uuid) from public;
grant execute on function admin_registrar_ingreso(uuid, text, numeric, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- admin_metricas: los ingresos manuales entran donde antes entraban los
-- ajustes de saldo. Cambia la firma → drop primero. Reemplaza 0043.
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
  ajustes_saldo_total numeric,
  recargas_total numeric,
  retiros_total numeric,
  ingresos_manuales_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
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
    -- Informativo: ya NO suma al ingreso ni al total. Un ajuste que sube el
    -- saldo de alguien sale de tu lado, no de un depósito.
    coalesce((
      select sum(saldo_nuevo - saldo_anterior) from ajustes_saldo where not es_fake
    ), 0)::numeric,
    coalesce((
      select sum(monto_acreditado) from recargas where estado = 'aprobada'
    ), 0)::numeric,
    coalesce((
      select sum(monto) from retiros where estado = 'pagado'
    ), 0)::numeric,
    coalesce((select sum(monto) from ingresos_manuales), 0)::numeric;
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- admin_resumen_diario: mismo cambio — los ingresos manuales entran donde
-- entraban los ajustes de saldo. Cuerpo de 0042 con la CTE cambiada.
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
  -- Plata que entró sin recarga (0044): efectivo, transferencia, etc.
  ing as (select (created_at at time zone 'America/Lima')::date as fecha, sum(monto) as monto
    from ingresos_manuales group by 1),
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
      coalesce(dep.monto, 0) + coalesce(ing.monto, 0) as depositado,
      coalesce(apo.monto, 0) as apostado,
      coalesce(pag.monto, 0) as pagado,
      coalesce(ret.monto, 0) as retirado,
      coalesce(com.monto, 0) as comision,
      coalesce(com.monto, 0) - coalesce(pmg.monto, 0) as ganancia_real,
      coalesce(dep.monto, 0) + coalesce(ing.monto, 0) - coalesce(ret.monto, 0)
        - coalesce(pm.monto, 0) + coalesce(aj.monto, 0) as delta_yape
    from dias
    left join dep on dep.fecha = dias.fecha
    left join ing on ing.fecha = dias.fecha
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
