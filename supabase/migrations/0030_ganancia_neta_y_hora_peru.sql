-- =============================================================================
-- LA PANCA — Ganancia neta de pagos a personal + "hoy" en hora de Perú
-- 0030_ganancia_neta_y_hora_peru.sql
--
-- 1. GANANCIA NETA: hasta ahora `pagos_manuales` (0022) solo restaba de
--    `yape_esperado` (cuánta plata real debería haber), pero no tocaba
--    `ganancia_hoy`/`ganancia_total` — un pago a un trabajador no bajaba
--    la ganancia mostrada, aunque sí sea un gasto real. Se agrega
--    `afecta_ganancia`, y a propósito la columna nace en `false` para
--    TODO lo ya registrado — solo los pagos nuevos, de acá para adelante,
--    restan de la ganancia. `alter table ... default true` deja los
--    pagos futuros en true automáticamente; el UPDATE de abajo es lo que
--    apaga los que ya existían al momento de correr esta migración.
--
-- 2. HORA DE PERÚ: "hoy" se calculaba con `date_trunc('day', now())`, que
--    usa el huso horario de la sesión de Postgres — casi seguro UTC, no
--    Perú (UTC-5, sin horario de verano). Cerca de la medianoche UTC
--    (7pm en Perú) el día ya había "cambiado" para el servidor aunque en
--    Perú siguiera siendo el día anterior — exactamente el síntoma
--    reportado. Se cambia a `now() at time zone 'America/Lima'` en cada
--    corte de "hoy" dentro de `admin_metricas`.
--
--    El mismo problema existe en el cliente (`getEventosHoy` en
--    betting.ts armaba la medianoche con el reloj del servidor de Next,
--    y el selector de fechas de /bakery/titulos con `toISOString()`, que
--    siempre da UTC) — eso se arregla aparte en TypeScript
--    (`src/lib/eventos.ts`), no acá.
-- =============================================================================

alter table pagos_manuales
  add column if not exists afecta_ganancia boolean not null default true;

update pagos_manuales set afecta_ganancia = false;

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
  yape_esperado numeric
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
    coalesce((
      select sum(r.monto_acreditado) from recargas r
      where r.estado = 'aprobada' and r.revisado_at >= v_inicio_hoy
    ), 0)::numeric,
    coalesce((
      select sum(t.monto) from retiros t
      where t.estado = 'pagado' and t.revisado_at >= v_inicio_hoy
    ), 0)::numeric,
    coalesce((
      select sum(m.monto) from movimientos_saldo m
      where m.tipo = 'pago_ganancia' and m.created_at >= v_inicio_hoy
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
      - coalesce((select sum(monto) from retiros where estado = 'pagado'), 0)
      - coalesce((select sum(monto) from pagos_manuales), 0)
      + coalesce((select sum(monto) from ajustes_yape), 0)
    )::numeric;
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;
