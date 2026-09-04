-- =============================================================================
-- CACHUDOBET — Cara o Sello: apuesta contra la casa, resultado en Postgres
-- 0049_cara_o_sello.sql
--
-- ACÁ LA CASA SÍ ES CONTRAPARTE. En el motor de apuestas (0001) la plataforma
-- nunca corre riesgo de mercado: empareja a dos jugadores y se queda una
-- comisión fija. En cara o sello no hay contra quién emparejar — el que paga
-- el premio es la casa. Con multiplicador 1.8 sobre una moneda 50/50, la
-- esperanza es 0.9 por sol apostado: la casa gana ~10% del volumen A LA
-- LARGA, pero un día puede perder. Es el mismo 1.8 de `CUOTA`, y por eso el
-- multiplicador es configurable (`cachudobet_config`, 0048) en vez de estar
-- clavado en el código.
--
-- EL RESULTADO SALE DE POSTGRES, NUNCA DEL NAVEGADOR. `random()` acá adentro,
-- en la misma transacción que descuenta y paga. El front recibe la jugada ya
-- resuelta y solo la anima: la moneda cae donde la base ya decidió. Un
-- `Math.random()` en el cliente sería, literalmente, dejar que el jugador
-- elija si ganó.
--
-- SOLO SALDO REAL, igual que la ruleta (ver 0048): el saldo fake existe para
-- dar con quién emparejar en el motor P2P, no para cobrarle premios a la casa.
--
-- SIN RETENCIÓN. Una jugada nace y muere en la misma transacción, así que no
-- hay nada que retener: se descuenta el monto y, si ganó, se acredita el pago
-- de una vez. `saldo_retenido` es para apuestas que quedan vivas esperando
-- resultado, que no es el caso.
--
-- OJO AL CORRER ESTA MIGRACIÓN: los valores nuevos del enum solo se usan
-- dentro de cuerpos plpgsql, así que corre de una (mismo caso que 0039/0048).
-- =============================================================================

alter type tipo_movimiento_saldo add value if not exists 'apuesta_cara_sello';
alter type tipo_movimiento_saldo add value if not exists 'premio_cara_sello';

-- `text` + check en vez de un enum nuevo: son dos valores que no van a
-- crecer, y un enum más obliga a la danza de "no se puede usar el valor en la
-- misma transacción" cada vez que se toca. Mismo criterio que `perfiles.rol`.
create table if not exists cara_sello_jugadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id),
  eleccion text not null check (eleccion in ('cara', 'sello')),
  resultado text not null check (resultado in ('cara', 'sello')),
  monto numeric(12, 2) not null check (monto > 0),
  gano boolean not null,
  -- Lo que se le acreditó. 0 si perdió.
  pago numeric(12, 2) not null default 0 check (pago >= 0),
  -- Snapshot: si mañana cambia el multiplicador, el historial sigue
  -- explicando por qué esa jugada pagó lo que pagó.
  multiplicador numeric(5, 2) not null,
  created_at timestamptz not null default now(),
  constraint pago_coherente_con_resultado check (
    (gano and pago > 0) or (not gano and pago = 0)
  ),
  constraint gano_coherente check (gano = (eleccion = resultado))
);

create index if not exists idx_cara_sello_usuario on cara_sello_jugadas (usuario_id, created_at desc);
create index if not exists idx_cara_sello_fecha on cara_sello_jugadas (created_at desc);

comment on table cara_sello_jugadas is
  'Jugadas de cara o sello (0049). El resultado lo decide `jugar_cara_sello` en Postgres; el cliente solo lo anima.';

alter table cara_sello_jugadas enable row level security;

-- Cada uno ve sus jugadas; el admin ve todas. Sin policies de escritura:
-- la única forma de crear una jugada es el RPC.
drop policy if exists cara_sello_select on cara_sello_jugadas;
create policy cara_sello_select
  on cara_sello_jugadas
  for select using (auth.uid() = usuario_id or es_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- jugar_cara_sello
-- ---------------------------------------------------------------------------

create or replace function jugar_cara_sello(
  p_usuario_id uuid,
  p_eleccion text,
  p_monto numeric
)
returns cara_sello_jugadas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config cachudobet_config%rowtype;
  v_perfil perfiles%rowtype;
  v_jugada cara_sello_jugadas%rowtype;
  v_resultado text;
  v_gano boolean;
  v_pago numeric(12, 2);
begin
  if p_eleccion not in ('cara', 'sello') then
    raise exception 'Elige cara o sello' using errcode = 'P0370';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0371';
  end if;
  p_monto := round(p_monto, 2);

  select * into v_config from cachudobet_config where id;

  if p_monto < v_config.cara_sello_min or p_monto > v_config.cara_sello_max then
    raise exception 'La apuesta debe estar entre S/% y S/%',
      trim(to_char(v_config.cara_sello_min, 'FM999999990.00')),
      trim(to_char(v_config.cara_sello_max, 'FM999999990.00'))
      using errcode = 'P0372';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0373';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede apostar' using errcode = 'P0374';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0375';
  end if;
  if v_perfil.saldo_disponible < p_monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0376';
  end if;

  -- Acá se decide la jugada. Con el perfil ya bloqueado, así que dos clics
  -- simultáneos se resuelven uno después del otro y cada uno paga lo suyo.
  v_resultado := case when random() < 0.5 then 'cara' else 'sello' end;
  v_gano := v_resultado = p_eleccion;
  v_pago := case when v_gano then round(p_monto * v_config.cara_sello_multiplicador, 2) else 0 end;

  update perfiles
    set saldo_disponible = saldo_disponible - p_monto + v_pago
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (p_usuario_id, 'apuesta_cara_sello', p_monto, false);

  if v_gano then
    insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
    values (p_usuario_id, 'premio_cara_sello', v_pago, false);
  end if;

  insert into cara_sello_jugadas (
    usuario_id, eleccion, resultado, monto, gano, pago, multiplicador
  )
  values (
    p_usuario_id, p_eleccion, v_resultado, p_monto, v_gano, v_pago,
    v_config.cara_sello_multiplicador
  )
  returning * into v_jugada;

  return v_jugada;
end;
$$;

revoke all on function jugar_cara_sello(uuid, text, numeric) from public;
grant execute on function jugar_cara_sello(uuid, text, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- admin_metricas_cara_sello: el tablero del juego.
--
-- `resultado_casa` = lo apostado menos lo pagado. Positivo es ganancia de la
-- casa; con pocas jugadas puede ser negativo y está bien — es el riesgo que
-- la casa sí corre en este juego (ver cabecera).
-- ---------------------------------------------------------------------------

create or replace function admin_metricas_cara_sello(p_admin_id uuid)
returns table (
  jugadas bigint,
  jugadores bigint,
  monto_apostado numeric,
  monto_pagado numeric,
  resultado_casa numeric,
  jugadas_ganadas bigint,
  jugadas_perdidas bigint,
  salio_cara bigint,
  salio_sello bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0380';
  end if;

  return query
  select
    count(*)::bigint,
    count(distinct j.usuario_id)::bigint,
    coalesce(sum(j.monto), 0)::numeric,
    coalesce(sum(j.pago), 0)::numeric,
    coalesce(sum(j.monto) - sum(j.pago), 0)::numeric,
    count(*) filter (where j.gano)::bigint,
    count(*) filter (where not j.gano)::bigint,
    count(*) filter (where j.resultado = 'cara')::bigint,
    count(*) filter (where j.resultado = 'sello')::bigint
  from cara_sello_jugadas j;
end;
$$;

revoke all on function admin_metricas_cara_sello(uuid) from public;
grant execute on function admin_metricas_cara_sello(uuid) to service_role;
