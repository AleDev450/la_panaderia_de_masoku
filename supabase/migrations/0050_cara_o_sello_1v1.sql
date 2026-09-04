-- =============================================================================
-- CACHUDOBET — Cara o Sello pasa a ser 1v1 entre jugadores
-- 0050_cara_o_sello_1v1.sql
--
-- QUÉ CAMBIA. En 0049 el juego era contra la casa: uno apostaba, Postgres
-- tiraba la moneda y la casa pagaba 1.8x. Eso metía a la plataforma en riesgo
-- de mercado, que es justo lo que el motor de apuestas evita desde 0001.
-- Ahora son DOS jugadores: uno abre la sala eligiendo lado y monto, otro se
-- sienta enfrente con el mismo monto, y ahí se tira la moneda.
--
-- LA ECONOMÍA VUELVE A SER LA DE LA CASA DE SIEMPRE. Los dos ponen `monto`,
-- el pozo es `2 * monto`, el ganador cobra `1.8 * monto` y la casa se queda
-- `0.2 * monto` — la misma comisión fija por sol emparejado que paga el resto
-- del motor. La casa gana lo mismo salga cara o sello: sin riesgo.
--
-- LOS MONTOS TIENEN QUE SER IGUALES. El motor de apuestas empareja parcial
-- porque es un libro de órdenes; una sala de cara o sello es un duelo. Que el
-- rival tenga que poner exactamente lo mismo hace que no haya nada que
-- devolver ni medias apuestas colgadas.
--
-- SÍ HAY RETENCIÓN, a diferencia de 0049. La apuesta del que abre queda VIVA
-- esperando rival, así que su plata va a `saldo_retenido` igual que en
-- `crear_apuesta` — no se la puede gastar dos veces, y si cancela le vuelve
-- entera.
--
-- `cara_sello_jugadas` SE CONSERVA y sigue siendo el historial por jugador:
-- cada duelo resuelto escribe DOS filas, una por lado. Así las filas viejas
-- del modo contra la casa siguen siendo válidas, la policy de RLS y los
-- índices no se tocan, y `admin_metricas_cara_sello` sigue funcionando —
-- con la ventaja de que ahora `apostado − pagado` da exactamente la comisión.
--
-- La comisión no va a `comisiones_plataforma` por lo mismo que la ruleta
-- (0048): esa tabla exige `evento_id` y alimenta la reconciliación de caja
-- que ya funciona. Queda en `cara_sello_salas.comision`.
--
-- No hace falta tocar el enum de `tipo_movimiento_saldo`: la retención y la
-- devolución reusan 'retencion' y 'devolucion', que existen desde 0001.
-- =============================================================================

-- El modo contra la casa se va. Mientras la función exista sigue siendo
-- llamable por el service_role, así que se borra en vez de dejarla huérfana.
drop function if exists jugar_cara_sello(uuid, text, numeric);

create table if not exists cara_sello_salas (
  id uuid primary key default gen_random_uuid(),
  creador_id uuid not null references perfiles (id),
  lado_creador text not null check (lado_creador in ('cara', 'sello')),
  monto numeric(12, 2) not null check (monto > 0),
  estado text not null default 'esperando'
    check (estado in ('esperando', 'resuelta', 'cancelada')),

  rival_id uuid references perfiles (id),
  resultado text check (resultado in ('cara', 'sello')),
  ganador_id uuid references perfiles (id),
  /** Lo que cobra el ganador: 1.8 * monto. */
  premio numeric(12, 2),
  /** Lo que se queda la casa: el pozo (2 * monto) menos el premio. */
  comision numeric(12, 2),
  /** Snapshot, como en `cara_sello_jugadas`: si cambia el multiplicador, el
      historial sigue explicando por qué esa sala pagó lo que pagó. */
  multiplicador numeric(5, 2) not null,

  created_at timestamptz not null default now(),
  resuelta_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint rival_distinto_del_creador
    check (rival_id is null or rival_id <> creador_id),
  -- Una sala resuelta tiene las tres cosas o ninguna: no existe "resuelta"
  -- a medias.
  constraint resuelta_completa check (
    (estado = 'resuelta')
    = (rival_id is not null and resultado is not null and ganador_id is not null)
  )
);

create index if not exists idx_cara_sello_salas_abiertas
  on cara_sello_salas (estado, created_at desc);
create index if not exists idx_cara_sello_salas_creador
  on cara_sello_salas (creador_id, created_at desc);
create index if not exists idx_cara_sello_salas_rival
  on cara_sello_salas (rival_id, created_at desc);

-- Solo una sala esperando por persona. Sin esto, alguien puede abrir veinte
-- y dejar todo su saldo retenido en salas que nadie va a tomar.
create unique index if not exists idx_una_sala_abierta_por_usuario
  on cara_sello_salas (creador_id)
  where estado = 'esperando';

drop trigger if exists trg_cara_sello_salas_updated_at on cara_sello_salas;
create trigger trg_cara_sello_salas_updated_at before update on cara_sello_salas
  for each row execute function set_updated_at();

-- El lobby es público para cualquiera logueado: hay que ver contra quién
-- sentarse. Sin policies de escritura — todo pasa por los RPC.
alter table cara_sello_salas enable row level security;

drop policy if exists cara_sello_salas_select on cara_sello_salas;
create policy cara_sello_salas_select
  on cara_sello_salas
  for select using (auth.role() = 'authenticated');

-- Cada jugada queda atada a su duelo. Nullable porque las filas de 0049
-- (modo contra la casa) no tienen sala y no se inventan una.
alter table cara_sello_jugadas
  add column if not exists sala_id uuid references cara_sello_salas (id);

comment on column cara_sello_jugadas.sala_id is
  'Duelo del que salió esta jugada (0050). Null en las jugadas viejas contra la casa (0049).';

-- ---------------------------------------------------------------------------
-- crear_sala_cara_sello: uno abre la mesa y espera rival.
--
-- Retiene el monto en el acto. La apuesta queda viva, así que la plata no
-- puede seguir disponible para otra cosa.
-- ---------------------------------------------------------------------------

create or replace function crear_sala_cara_sello(
  p_usuario_id uuid,
  p_lado text,
  p_monto numeric
)
returns cara_sello_salas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config cachudobet_config%rowtype;
  v_perfil perfiles%rowtype;
  v_sala cara_sello_salas%rowtype;
begin
  if p_lado not in ('cara', 'sello') then
    raise exception 'Elige cara o sello' using errcode = 'P0390';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0391';
  end if;
  p_monto := round(p_monto, 2);

  select * into v_config from cachudobet_config where id;

  if p_monto < v_config.cara_sello_min or p_monto > v_config.cara_sello_max then
    raise exception 'La apuesta debe estar entre S/% y S/%',
      trim(to_char(v_config.cara_sello_min, 'FM999999990.00')),
      trim(to_char(v_config.cara_sello_max, 'FM999999990.00'))
      using errcode = 'P0392';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0393';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede apostar' using errcode = 'P0394';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0395';
  end if;
  if v_perfil.saldo_disponible < p_monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0396';
  end if;

  if exists (
    select 1 from cara_sello_salas
    where creador_id = p_usuario_id and estado = 'esperando'
  ) then
    raise exception 'Ya tienes una sala esperando rival' using errcode = 'P0397';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible - p_monto,
        saldo_retenido = saldo_retenido + p_monto
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (p_usuario_id, 'retencion', p_monto, false);

  insert into cara_sello_salas (creador_id, lado_creador, monto, multiplicador)
  values (p_usuario_id, p_lado, p_monto, v_config.cara_sello_multiplicador)
  returning * into v_sala;

  return v_sala;
end;
$$;

revoke all on function crear_sala_cara_sello(uuid, text, numeric) from public;
grant execute on function crear_sala_cara_sello(uuid, text, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- unirse_cara_sello: el rival se sienta y la moneda cae en el acto.
--
-- El `for update` sobre la sala es lo que impide que dos personas tomen la
-- misma mesa: la segunda espera, y cuando entra ya la encuentra 'resuelta'.
--
-- El resultado sale de `random()` acá adentro, en la misma transacción que
-- mueve el saldo de los dos. Ninguno de los dos navegadores decide nada.
-- ---------------------------------------------------------------------------

create or replace function unirse_cara_sello(
  p_usuario_id uuid,
  p_sala_id uuid
)
returns cara_sello_salas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sala cara_sello_salas%rowtype;
  v_perfil perfiles%rowtype;
  v_lado_rival text;
  v_resultado text;
  v_ganador uuid;
  v_premio numeric(12, 2);
  v_comision numeric(12, 2);
begin
  select * into v_sala from cara_sello_salas where id = p_sala_id for update;
  if not found then
    raise exception 'Sala no encontrada' using errcode = 'P0400';
  end if;
  if v_sala.estado <> 'esperando' then
    raise exception 'Esta sala ya no está disponible' using errcode = 'P0401';
  end if;
  if v_sala.creador_id = p_usuario_id then
    raise exception 'No puedes jugar contra ti mismo' using errcode = 'P0402';
  end if;

  -- Los DOS perfiles se bloquean juntos y SIEMPRE en el mismo orden (por id).
  -- Sin esto hay deadlock cruzado: si A entra a la sala de B mientras B entra
  -- a la de A, cada transacción tendría bloqueado el perfil que la otra
  -- necesita. Postgres lo detectaría y mataría una — con un error feo justo
  -- en medio de un movimiento de plata.
  perform 1 from perfiles
    where id in (v_sala.creador_id, p_usuario_id)
    order by id
    for update;

  select * into v_perfil from perfiles where id = p_usuario_id;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0403';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede apostar' using errcode = 'P0404';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0405';
  end if;
  if v_perfil.saldo_disponible < v_sala.monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0406';
  end if;

  v_lado_rival := case when v_sala.lado_creador = 'cara' then 'sello' else 'cara' end;

  -- El rival también pasa por retención: así los dos lados quedan contados
  -- igual en `movimientos_saldo` y el saldo nunca aparece disponible cuando
  -- ya está comprometido, ni siquiera por un instante.
  update perfiles
    set saldo_disponible = saldo_disponible - v_sala.monto,
        saldo_retenido = saldo_retenido + v_sala.monto
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (p_usuario_id, 'retencion', v_sala.monto, false);

  -- Acá cae la moneda.
  v_resultado := case when random() < 0.5 then 'cara' else 'sello' end;
  v_ganador := case
    when v_resultado = v_sala.lado_creador then v_sala.creador_id
    else p_usuario_id
  end;

  v_premio := round(v_sala.monto * v_sala.multiplicador, 2);
  -- La comisión es el RESTO del pozo, no un segundo redondeo: así las dos
  -- partes siempre suman lo que de verdad entró.
  v_comision := (v_sala.monto * 2) - v_premio;

  -- Los dos sueltan lo retenido; el ganador recibe el premio completo.
  update perfiles
    set saldo_retenido = saldo_retenido - v_sala.monto
    where id in (v_sala.creador_id, p_usuario_id);

  update perfiles
    set saldo_disponible = saldo_disponible + v_premio
    where id = v_ganador;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (v_ganador, 'premio_cara_sello', v_premio, false);

  -- Una fila por jugador: `cara_sello_jugadas` sigue siendo el historial
  -- por persona, y con eso `admin_metricas_cara_sello` no se toca.
  insert into cara_sello_jugadas (
    usuario_id, eleccion, resultado, monto, gano, pago, multiplicador, sala_id
  )
  values
    (
      v_sala.creador_id, v_sala.lado_creador, v_resultado, v_sala.monto,
      v_resultado = v_sala.lado_creador,
      case when v_resultado = v_sala.lado_creador then v_premio else 0 end,
      v_sala.multiplicador, v_sala.id
    ),
    (
      p_usuario_id, v_lado_rival, v_resultado, v_sala.monto,
      v_resultado = v_lado_rival,
      case when v_resultado = v_lado_rival then v_premio else 0 end,
      v_sala.multiplicador, v_sala.id
    );

  update cara_sello_salas
    set estado = 'resuelta',
        rival_id = p_usuario_id,
        resultado = v_resultado,
        ganador_id = v_ganador,
        premio = v_premio,
        comision = v_comision,
        resuelta_at = now()
    where id = p_sala_id
    returning * into v_sala;

  return v_sala;
end;
$$;

revoke all on function unirse_cara_sello(uuid, uuid) from public;
grant execute on function unirse_cara_sello(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- cancelar_sala_cara_sello: se arrepintió antes de que llegara nadie.
--
-- Solo el dueño y solo mientras esté esperando. Si ya entró un rival, la
-- moneda ya cayó y no hay nada que cancelar.
-- ---------------------------------------------------------------------------

create or replace function cancelar_sala_cara_sello(
  p_usuario_id uuid,
  p_sala_id uuid
)
returns cara_sello_salas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sala cara_sello_salas%rowtype;
begin
  select * into v_sala from cara_sello_salas where id = p_sala_id for update;
  if not found then
    raise exception 'Sala no encontrada' using errcode = 'P0410';
  end if;
  if v_sala.creador_id <> p_usuario_id and not es_admin(p_usuario_id) then
    raise exception 'Esta sala no es tuya' using errcode = 'P0411';
  end if;
  if v_sala.estado <> 'esperando' then
    raise exception 'Esta sala ya no se puede cancelar' using errcode = 'P0412';
  end if;

  update perfiles
    set saldo_retenido = saldo_retenido - v_sala.monto,
        saldo_disponible = saldo_disponible + v_sala.monto
    where id = v_sala.creador_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (v_sala.creador_id, 'devolucion', v_sala.monto, false);

  update cara_sello_salas
    set estado = 'cancelada'
    where id = p_sala_id
    returning * into v_sala;

  return v_sala;
end;
$$;

revoke all on function cancelar_sala_cara_sello(uuid, uuid) from public;
grant execute on function cancelar_sala_cara_sello(uuid, uuid) to service_role;
