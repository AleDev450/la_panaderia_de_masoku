-- =============================================================================
-- LA PANCA — Saldo fake (plata de mentira que da liquidez sin ser plata)
-- 0036_saldo_fake.sql
--
-- PARA QUÉ: poder darle saldo a una cuenta para que haya con quién
-- emparejar, sin que esa plata cuente como depósito, como deuda con el
-- jugador ni como plata que debería estar en el Yape. `admin_ajustar_saldo`
-- (0024) no sirve para esto: el saldo que reparte es indistinguible del
-- real, así que infla `saldos_usuarios_total` y con él `yape_esperado`.
--
-- CÓMO SE GUARDA: dos columnas nuevas en `perfiles` — `saldo_fake` y
-- `saldo_fake_retenido` — que son el espejo exacto de `saldo_disponible` /
-- `saldo_retenido`. Van aparte y no se suman en ningún lado: por eso
-- `yape_esperado`, `saldos_usuarios_total` y `solicitar_retiro` siguen
-- funcionando sin tocarlos — no ven el saldo fake porque no está en las
-- columnas que miran. Retirar plata fake es imposible por construcción.
--
-- DE QUÉ BOLSA SALE CADA APUESTA: de una sola. Una apuesta es 100% fake o
-- 100% real, nunca mitad y mitad — con montos mezclados habría que repartir
-- el premio proporcionalmente entre las dos bolsas, con su redondeo, y
-- además partir cada emparejamiento en una parte fake y una real para poder
-- sacar la cuenta de abajo. No vale la pena. La regla es: si el saldo fake
-- ALCANZA para cubrir la apuesta entera, la apuesta es fake; si no, sale del
-- saldo real. Consecuencia a aceptar: con S/30 fake y S/100 real, una
-- apuesta de S/50 sale del real y el saldo fake queda ahí sin usarse.
--
-- LA CUENTA DE LA CASA. Hasta ahora la plataforma no corría riesgo: se
-- llevaba 0.20 por cada sol emparejado, ganara quien ganara (ver el modelo
-- económico en 0001_schema.sql). Con plata fake de por medio eso deja de
-- ser cierto, porque un lado del emparejamiento no puso plata de verdad.
-- Por cada emparejamiento de monto `m`, según quién ganó:
--
--   real vs real   → +0.20m   la comisión de siempre.
--   fake vs fake   →  0       no se movió un sol de verdad.
--   gana el real   → −0.80m   entró m real (lo del ganador) y sale 1.80m
--                             de premio. La diferencia la pone la casa: es
--                             el costo de haber puesto la contraparte falsa.
--   gana el fake   → +1.00m   entró m real (lo del perdedor) y el premio de
--                             1.80m se paga en fake, que no cuesta nada. El
--                             perdedor real sí pierde su plata real.
--
-- Por eso `comisiones_plataforma.monto` deja de ser "la comisión" y pasa a
-- ser el RESULTADO REAL del evento, que ahora puede ser negativo — se le
-- quita el `check (monto >= 0)`. Se mantiene el nombre de la tabla y de la
-- columna a propósito: renombrarlos obligaría a tocar `admin_metricas`,
-- `admin_resumen_diario`, los tipos de TS y el dashboard para no ganar nada.
-- Sin apuestas fake el número es idéntico al de antes (0.20 por sol
-- emparejado), así que el histórico sigue siendo comparable.
--
-- QUÉ NO CUENTA EL FAKE, y dónde se filtra:
--   - `movimientos_saldo.es_fake` marca cada movimiento, para que
--     `pagado_hoy` (premios) no cuente premios pagados en fake.
--   - `apuestas.es_fake` marca la apuesta, para que `apostado` del resumen
--     diario y el requisito de retiro (0016) no cuenten volumen falso.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Columnas
-- ---------------------------------------------------------------------------

alter table perfiles
  add column if not exists saldo_fake numeric(12, 2) not null default 0,
  add column if not exists saldo_fake_retenido numeric(12, 2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'saldo_fake_no_negativo') then
    alter table perfiles add constraint saldo_fake_no_negativo check (saldo_fake >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'saldo_fake_retenido_no_negativo') then
    alter table perfiles add constraint saldo_fake_retenido_no_negativo check (saldo_fake_retenido >= 0);
  end if;
end;
$$;

comment on column perfiles.saldo_fake is
  'Saldo de mentira (0036). No es plata real: no viene de una recarga, no se puede retirar y no entra en yape_esperado.';

alter table apuestas
  add column if not exists es_fake boolean not null default false;

comment on column apuestas.es_fake is
  'La apuesta se pagó con saldo fake (0036). Una apuesta es 100% fake o 100% real.';

alter table movimientos_saldo
  add column if not exists es_fake boolean not null default false;

-- El resultado real de un evento puede ser negativo cuando gana un jugador
-- real contra una contraparte fake — ver la cuenta de la casa arriba.
alter table comisiones_plataforma drop constraint if exists comisiones_plataforma_monto_check;

comment on column comisiones_plataforma.monto is
  'Resultado REAL del evento para la casa (0036). Sin apuestas fake es la comisión de 0.20 por sol emparejado; con fake puede ser negativo.';

-- El ajuste de saldo (0024) ahora audita las dos bolsas.
alter table ajustes_saldo
  add column if not exists es_fake boolean not null default false;

-- ---------------------------------------------------------------------------
-- admin_dar_saldo_fake: reparte plata de mentira.
--
-- A diferencia de `admin_ajustar_saldo` (0024), que FIJA el saldo en un
-- valor, este SUMA (o resta, con monto negativo) — que es como se usa en la
-- práctica: "dale S/50 más para que siga jugando". Se audita en la misma
-- tabla `ajustes_saldo` con `es_fake = true` para tener un solo historial.
-- ---------------------------------------------------------------------------

create or replace function admin_dar_saldo_fake(
  p_admin_id uuid,
  p_usuario_id uuid,
  p_monto numeric,
  p_motivo text
)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
  v_anterior numeric(12, 2);
  v_nuevo numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede dar saldo fake' using errcode = 'P0170';
  end if;
  if p_monto is null or p_monto = 0 then
    raise exception 'El monto debe ser distinto de 0' using errcode = 'P0171';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Indica el motivo' using errcode = 'P0172';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0173';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no tiene saldo de juego' using errcode = 'P0174';
  end if;

  v_anterior := v_perfil.saldo_fake;
  v_nuevo := round(v_anterior + p_monto, 2);

  -- Quitar más de lo que hay disponible dejaría el saldo negativo. Lo que
  -- ya está en juego (saldo_fake_retenido) no se puede tocar acá.
  if v_nuevo < 0 then
    raise exception 'No puedes quitar más saldo fake del disponible (S/%)', v_anterior
      using errcode = 'P0175';
  end if;

  update perfiles
    set saldo_fake = v_nuevo
    where id = p_usuario_id
    returning * into v_perfil;

  insert into ajustes_saldo (admin_id, usuario_id, saldo_anterior, saldo_nuevo, motivo, es_fake)
  values (p_admin_id, p_usuario_id, v_anterior, v_nuevo, trim(p_motivo), true);

  return v_perfil;
end;
$$;

revoke all on function admin_dar_saldo_fake(uuid, uuid, numeric, text) from public;
grant execute on function admin_dar_saldo_fake(uuid, uuid, numeric, text) to service_role;

-- ---------------------------------------------------------------------------
-- crear_apuesta: elige la bolsa. Mismo cuerpo de 0016, con la elección de
-- saldo y el marcado de la apuesta — `create or replace` reemplaza la
-- función entera, así que se repite completa.
-- ---------------------------------------------------------------------------

create or replace function crear_apuesta(
  p_usuario_id uuid,
  p_evento_id uuid,
  p_lado lado_apuesta,
  p_monto numeric
)
returns apuestas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_perfil perfiles%rowtype;
  v_nueva_apuesta apuestas%rowtype;
  v_restante numeric(12, 2);
  v_lado_contrario lado_apuesta;
  v_orden record;
  v_monto_par numeric(12, 2);
  v_es_fake boolean;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0001';
  end if;
  p_monto := round(p_monto, 2);

  if p_monto < 10 or p_monto > 100 then
    raise exception 'La apuesta debe estar entre S/10 y S/100' using errcode = 'P0007';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;
  if v_evento.estado <> 'abierto' then
    raise exception 'El evento no está abierto para apuestas' using errcode = 'P0003';
  end if;
  if now() > v_evento.cierra_en then
    raise exception 'El título ya cerró para nuevas apuestas' using errcode = 'P0006';
  end if;

  v_lado_contrario := case when p_lado = 'a' then 'b' else 'a' end;

  if exists (
    select 1 from apuestas
    where evento_id = p_evento_id
      and usuario_id = p_usuario_id
      and lado = v_lado_contrario
      and estado <> 'cancelada'
  ) then
    raise exception 'Ya apostaste al otro lado de esta sala' using errcode = 'P0100';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0004';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede apostar' using errcode = 'P0008';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0009';
  end if;

  -- El saldo fake se gasta primero, pero solo si cubre la apuesta entera:
  -- no se parte una apuesta entre las dos bolsas (ver cabecera de 0036).
  v_es_fake := v_perfil.saldo_fake >= p_monto;

  if not v_es_fake and v_perfil.saldo_disponible < p_monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0005';
  end if;

  if v_es_fake then
    update perfiles
      set saldo_fake = saldo_fake - p_monto,
          saldo_fake_retenido = saldo_fake_retenido + p_monto
      where id = p_usuario_id;
  else
    update perfiles
      set saldo_disponible = saldo_disponible - p_monto,
          saldo_retenido = saldo_retenido + p_monto
      where id = p_usuario_id;
  end if;

  insert into movimientos_saldo (usuario_id, tipo, monto, evento_id, es_fake)
  values (p_usuario_id, 'retencion', p_monto, p_evento_id, v_es_fake);

  insert into apuestas (evento_id, usuario_id, lado, monto_total, monto_matcheado, monto_pendiente, estado, es_fake)
  values (p_evento_id, p_usuario_id, p_lado, p_monto, 0, p_monto, 'pendiente', v_es_fake)
  returning * into v_nueva_apuesta;

  v_restante := p_monto;

  for v_orden in
    select id, monto_pendiente
    from apuestas
    where evento_id = p_evento_id
      and lado = v_lado_contrario
      and estado in ('pendiente', 'parcial')
      and monto_pendiente > 0
      and usuario_id <> p_usuario_id
    order by created_at asc
    for update skip locked
  loop
    exit when v_restante <= 0;

    v_monto_par := least(v_restante, v_orden.monto_pendiente);

    update apuestas
      set monto_matcheado = monto_matcheado + v_monto_par,
          monto_pendiente = monto_pendiente - v_monto_par,
          estado = (case when monto_pendiente - v_monto_par <= 0 then 'completa' else 'parcial' end)::estado_apuesta
      where id = v_orden.id;

    update apuestas
      set monto_matcheado = monto_matcheado + v_monto_par,
          monto_pendiente = monto_pendiente - v_monto_par,
          estado = (case when monto_pendiente - v_monto_par <= 0 then 'completa' else 'parcial' end)::estado_apuesta
      where id = v_nueva_apuesta.id;

    insert into emparejamientos (evento_id, apuesta_a_id, apuesta_b_id, monto)
    values (
      p_evento_id,
      case when p_lado = 'a' then v_nueva_apuesta.id else v_orden.id end,
      case when p_lado = 'a' then v_orden.id else v_nueva_apuesta.id end,
      v_monto_par
    );

    v_restante := v_restante - v_monto_par;
  end loop;

  select * into v_nueva_apuesta from apuestas where id = v_nueva_apuesta.id;
  return v_nueva_apuesta;
end;
$$;

revoke all on function crear_apuesta(uuid, uuid, lado_apuesta, numeric) from public;
grant execute on function crear_apuesta(uuid, uuid, lado_apuesta, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- cancelar_apuesta: devuelve a la bolsa de la que salió (cuerpo de 0002).
-- ---------------------------------------------------------------------------

create or replace function cancelar_apuesta(
  p_apuesta_id uuid,
  p_usuario_id uuid
)
returns apuestas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apuesta apuestas%rowtype;
  v_evento eventos%rowtype;
begin
  select * into v_apuesta from apuestas where id = p_apuesta_id for update;
  if not found then
    raise exception 'Apuesta no encontrada' using errcode = 'P0010';
  end if;
  if v_apuesta.usuario_id <> p_usuario_id then
    raise exception 'No autorizado para cancelar esta apuesta' using errcode = 'P0011';
  end if;

  select * into v_evento from eventos where id = v_apuesta.evento_id for update;
  if v_evento.estado <> 'abierto' then
    raise exception 'Solo se pueden cancelar apuestas de eventos abiertos' using errcode = 'P0012';
  end if;

  if v_apuesta.estado = 'cancelada' or v_apuesta.monto_pendiente <= 0 then
    raise exception 'No hay monto pendiente para cancelar' using errcode = 'P0013';
  end if;

  if v_apuesta.es_fake then
    update perfiles
      set saldo_fake = saldo_fake + v_apuesta.monto_pendiente,
          saldo_fake_retenido = saldo_fake_retenido - v_apuesta.monto_pendiente
      where id = p_usuario_id;
  else
    update perfiles
      set saldo_disponible = saldo_disponible + v_apuesta.monto_pendiente,
          saldo_retenido = saldo_retenido - v_apuesta.monto_pendiente
      where id = p_usuario_id;
  end if;

  insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id, es_fake)
  values (p_usuario_id, 'cancelacion', v_apuesta.monto_pendiente, p_apuesta_id, v_apuesta.evento_id, v_apuesta.es_fake);

  update apuestas
    set monto_pendiente = 0,
        estado = (case when monto_matcheado > 0 then 'completa' else 'cancelada' end)::estado_apuesta
    where id = p_apuesta_id
    returning * into v_apuesta;

  return v_apuesta;
end;
$$;

revoke all on function cancelar_apuesta(uuid, uuid) from public;
grant execute on function cancelar_apuesta(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- liquidar_evento: paga a la bolsa correcta y registra el resultado REAL
-- del evento (que ya no es siempre la comisión). Cuerpo de 0018 + fake.
-- ---------------------------------------------------------------------------

create or replace function liquidar_evento(
  p_evento_id uuid,
  p_resultado lado_apuesta
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_apuesta record;
  v_payout numeric(12, 2);
  v_resultado_real numeric(12, 2);
begin
  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0021';
  end if;
  if v_evento.estado = 'resuelto' then
    raise exception 'El evento ya fue resuelto' using errcode = 'P0022';
  end if;

  update eventos
    set estado = 'resuelto', resultado = p_resultado
    where id = p_evento_id;

  -- Devuelve todo lo no emparejado.
  for v_apuesta in
    select * from apuestas
    where evento_id = p_evento_id and monto_pendiente > 0
    for update
  loop
    if v_apuesta.es_fake then
      update perfiles
        set saldo_fake = saldo_fake + v_apuesta.monto_pendiente,
            saldo_fake_retenido = saldo_fake_retenido - v_apuesta.monto_pendiente
        where id = v_apuesta.usuario_id;
    else
      update perfiles
        set saldo_disponible = saldo_disponible + v_apuesta.monto_pendiente,
            saldo_retenido = saldo_retenido - v_apuesta.monto_pendiente
        where id = v_apuesta.usuario_id;
    end if;

    insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id, es_fake)
    values (v_apuesta.usuario_id, 'devolucion', v_apuesta.monto_pendiente, v_apuesta.id, p_evento_id, v_apuesta.es_fake);

    update apuestas
      set monto_pendiente = 0,
          estado = (case when monto_matcheado > 0 then 'completa' else 'cancelada' end)::estado_apuesta
      where id = v_apuesta.id;
  end loop;

  -- Liquida lo emparejado y reparte los puntos de progresión.
  for v_apuesta in
    select * from apuestas
    where evento_id = p_evento_id and monto_matcheado > 0
    for update
  loop
    if v_apuesta.lado = p_resultado then
      v_payout := round(v_apuesta.monto_matcheado * 1.80, 2);

      if v_apuesta.es_fake then
        update perfiles
          set saldo_fake = saldo_fake + v_payout,
              saldo_fake_retenido = saldo_fake_retenido - v_apuesta.monto_matcheado,
              puntos = puntos + 3
          where id = v_apuesta.usuario_id;
      else
        update perfiles
          set saldo_disponible = saldo_disponible + v_payout,
              saldo_retenido = saldo_retenido - v_apuesta.monto_matcheado,
              puntos = puntos + 3
          where id = v_apuesta.usuario_id;
      end if;

      insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id, es_fake)
      values (v_apuesta.usuario_id, 'pago_ganancia', v_payout, v_apuesta.id, p_evento_id, v_apuesta.es_fake);
    else
      if v_apuesta.es_fake then
        update perfiles
          set saldo_fake_retenido = saldo_fake_retenido - v_apuesta.monto_matcheado,
              puntos = puntos + 1
          where id = v_apuesta.usuario_id;
      else
        update perfiles
          set saldo_retenido = saldo_retenido - v_apuesta.monto_matcheado,
              puntos = puntos + 1
          where id = v_apuesta.usuario_id;
      end if;
    end if;
  end loop;

  -- Resultado real del evento para la casa, emparejamiento por
  -- emparejamiento. `apuesta_a_id` es siempre la del lado 'a' y
  -- `apuesta_b_id` la del lado 'b' (ver el insert en `crear_apuesta`).
  select coalesce(round(sum(
    case
      when gana_fake and pierde_fake then 0
      when not gana_fake and not pierde_fake then monto * 0.20
      when gana_fake then monto
      else monto * -0.80
    end
  ), 2), 0)
  into v_resultado_real
  from (
    select
      e.monto,
      case when p_resultado = 'a' then aa.es_fake else ab.es_fake end as gana_fake,
      case when p_resultado = 'a' then ab.es_fake else aa.es_fake end as pierde_fake
    from emparejamientos e
    join apuestas aa on aa.id = e.apuesta_a_id
    join apuestas ab on ab.id = e.apuesta_b_id
    where e.evento_id = p_evento_id
  ) pares;

  insert into comisiones_plataforma (evento_id, monto)
  values (p_evento_id, v_resultado_real);
end;
$$;

revoke all on function liquidar_evento(uuid, lado_apuesta) from public;
grant execute on function liquidar_evento(uuid, lado_apuesta) to service_role;

-- ---------------------------------------------------------------------------
-- admin_cancelar_evento: devuelve a la bolsa correcta (cuerpo de 0029).
-- ---------------------------------------------------------------------------

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
      if v_apuesta.es_fake then
        update perfiles
          set saldo_fake = saldo_fake + v_monto,
              saldo_fake_retenido = saldo_fake_retenido - v_monto
          where id = v_apuesta.usuario_id;
      else
        update perfiles
          set saldo_disponible = saldo_disponible + v_monto,
              saldo_retenido = saldo_retenido - v_monto
          where id = v_apuesta.usuario_id;
      end if;

      insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id, es_fake)
      values (v_apuesta.usuario_id, 'cancelacion', v_monto, v_apuesta.id, p_evento_id, v_apuesta.es_fake);
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

-- ---------------------------------------------------------------------------
-- requisito_retiro: el volumen apostado en fake no libera el retiro. Si
-- contara, bastaría con recibir saldo fake, apostarlo y ya poder sacar la
-- plata real de la recarga sin haberla jugado.
-- ---------------------------------------------------------------------------

create or replace function requisito_retiro(p_usuario_id uuid)
returns table(recargas_aprobadas integer, monto_apostado numeric, monto_requerido numeric)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*)::integer from recargas
      where usuario_id = p_usuario_id and estado = 'aprobada') as recargas_aprobadas,
    coalesce((select sum(monto_matcheado) from apuestas
      where usuario_id = p_usuario_id and not es_fake), 0) as monto_apostado,
    5 * (select count(*) from recargas
      where usuario_id = p_usuario_id and estado = 'aprobada') as monto_requerido;
$$;

revoke all on function requisito_retiro(uuid) from public;
grant execute on function requisito_retiro(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- admin_metricas: se excluye el fake de "Pagado" y se agregan dos columnas
-- nuevas — `retiros_pagados_hoy` (a cuántas personas les yapeaste hoy) y
-- `saldo_fake_total` (cuánta plata de mentira hay dando vueltas). Cambia la
-- firma, así que hay que soltarla antes.
--
-- No se agrega un "pagado_yape_hoy": sería exactamente `retirado_hoy` (la
-- misma tabla, el mismo corte por `revisado_at`, que es justo cuando salió
-- la plata del Yape). Lo que faltaba era el CONTEO — el monto ya estaba —
-- así que la tarjeta del dashboard pasa a llamarse "Pagué en Yape" y usa
-- estas dos columnas juntas.
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
  saldo_fake_total numeric
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
    ), 0)::numeric;
end;
$$;

revoke all on function admin_metricas(uuid) from public;
grant execute on function admin_metricas(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- admin_resumen_diario: `apostado` y `pagado` dejan de contar el fake, para
-- que el cuadro del mes siga siendo de plata real. Cuerpo de 0035.
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
    acum.comision::numeric,
    acum.ganancia_real::numeric,
    acum.yape_acumulado::numeric
  from acum
  where acum.depositado + acum.apostado + acum.pagado + acum.comision <> 0
     or acum.delta_yape <> 0
  order by acum.fecha desc;
end;
$$;

revoke all on function admin_resumen_diario(uuid, date, date) from public;
grant execute on function admin_resumen_diario(uuid, date, date) to service_role;
