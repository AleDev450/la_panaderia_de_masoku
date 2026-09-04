-- =============================================================================
-- CACHUDOBET — Ruleta por tickets: rondas con pozo y ganador sorteado en SQL
-- 0048_cachudobet_ruleta.sql
--
-- QUÉ ES. Una ronda es una bolsa común: la gente compra tickets con su saldo,
-- todo lo que entra forma el POZO, y al cerrar se sortea UN ticket ganador.
-- El pozo se parte entre el ganador y la casa según los porcentajes de
-- `cachudobet_config` (80/20 por defecto).
--
-- NO ES EL MOTOR DE APUESTAS. No hay emparejamiento, ni lados, ni cuota fija:
-- `eventos` / `apuestas` / `emparejamientos` no se tocan acá. Tampoco es el
-- `sorteos` de 0037 (cofres de Steam, tickets escritos a mano, sin plata de
-- por medio) — ese sigue igual y para otra cosa.
--
-- UNA FILA POR TICKET, no una por compra. Comprar S/9 crea TRES filas. Cuesta
-- más espacio y se gana lo que importa:
--   - cada ticket tiene id y código propios, que es lo que se muestra al
--     anunciar al ganador ("Ticket ganador: #0124-00042");
--   - el sorteo es un `order by random() limit 1` UNIFORME sobre las filas.
--     La repetición de filas ES la ponderación: con 10 tickets tienes diez
--     filas y por lo tanto diez veces la chance de quien tiene una. No hace
--     falta la fórmula de Efraimidis–Spirakis que usa `admin_sortear_ganador`
--     (0038) justamente porque allá los tickets son un CONTADOR en una fila.
--
-- EL GANADOR SE ELIGE Y SE GUARDA ANTES DE QUE GIRE NADA. `admin_girar_ruleta`
-- sortea, paga y recién entonces fija `giro_inicia_en` (reloj de Postgres,
-- ahora + 3s). El navegador no elige: recibe el ganador ya escrito y anima
-- hacia él. Como todos anclan la animación a ese mismo timestamp del
-- servidor, todas las pantallas caen en el ganador en el mismo instante
-- aunque se hayan enterado en momentos distintos.
--
-- SOLO SALDO REAL. A diferencia de `crear_apuesta` (0036), acá el saldo fake
-- NO entra. Dejarlo entrar permitiría que una cuenta fondeada con plata de
-- mentira se lleve soles reales del resto: en el motor de apuestas la casa
-- puede absorber eso porque conoce el costo por sol emparejado, pero en un
-- pozo común el que pierde es el otro jugador, no la casa.
--
-- LA COMISIÓN NO VA A `comisiones_plataforma`. Esa tabla tiene
-- `evento_id not null unique` y alimenta `admin_metricas` /
-- `admin_resumen_diario`; meterle rondas obligaría a tocar la reconciliación
-- de caja que ya funciona. No hace falta: el 20% se queda dentro del sistema
-- como saldo que ya NO le pertenece a ningún jugador, así que baja
-- `saldos_usuarios_total` y sube solo el "Tuyo" del panel — que es
-- exactamente lo que corresponde. El desglose por ronda vive en
-- `ruleta_rondas.comision_monto`.
--
-- OJO AL CORRER ESTA MIGRACIÓN: `alter type ... add value` no permite USAR el
-- valor nuevo en la misma transacción en que se agrega. Acá los valores
-- nuevos de `tipo_movimiento_saldo` solo aparecen dentro de cuerpos plpgsql
-- (que no se evalúan al crearlos), así que corre de una — igual que 0039.
-- =============================================================================

alter type tipo_movimiento_saldo add value if not exists 'ticket_ruleta';
alter type tipo_movimiento_saldo add value if not exists 'premio_ruleta';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_ronda_ruleta') then
    create type estado_ronda_ruleta as enum (
      'borrador',    -- se está armando; no acepta tickets
      'abierta',     -- acepta tickets
      'cerrada',     -- ya no acepta tickets, lista para girar
      'girando',     -- ganador elegido y pagado; la animación está corriendo
      'finalizada'   -- cerrada para el historial
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- cachudobet_config: una sola fila.
--
-- Los porcentajes NO viven en JavaScript. El cliente los lee para mostrarlos,
-- pero el reparto lo hace `admin_girar_ruleta` leyendo de acá.
-- ---------------------------------------------------------------------------

create table if not exists cachudobet_config (
  -- Truco de fila única: la PK es un booleano que solo puede ser true.
  id boolean primary key default true,
  precio_ticket numeric(12, 2) not null default 3 check (precio_ticket > 0),
  porcentaje_premio numeric(5, 2) not null default 80 check (porcentaje_premio >= 0),
  porcentaje_casa numeric(5, 2) not null default 20 check (porcentaje_casa >= 0),
  cara_sello_multiplicador numeric(5, 2) not null default 1.8 check (cara_sello_multiplicador > 1),
  cara_sello_min numeric(12, 2) not null default 5 check (cara_sello_min > 0),
  cara_sello_max numeric(12, 2) not null default 100 check (cara_sello_max > 0),
  updated_at timestamptz not null default now(),
  constraint config_fila_unica check (id),
  constraint porcentajes_suman_100 check (porcentaje_premio + porcentaje_casa = 100),
  constraint cara_sello_rango_coherente check (cara_sello_max >= cara_sello_min)
);

insert into cachudobet_config (id) values (true) on conflict (id) do nothing;

comment on table cachudobet_config is
  'Parámetros de los juegos de CACHUDOBET (0048). Fila única. Los porcentajes del pozo se leen de acá, nunca del cliente.';

-- ---------------------------------------------------------------------------
-- ruleta_rondas
--
-- Los tres parámetros de config se COPIAN a la ronda al crearla. Si mañana el
-- admin cambia el reparto a 70/30, las rondas ya creadas —y sobre todo el
-- historial— tienen que seguir contando su plata con el número con el que se
-- jugaron. Es el mismo criterio con el que `comisiones_plataforma` guarda el
-- resultado real en vez de recalcularlo después.
-- ---------------------------------------------------------------------------

create sequence if not exists ruleta_ronda_numero_seq start 1;

create table if not exists ruleta_rondas (
  id uuid primary key default gen_random_uuid(),
  -- El "#124" que se muestra. Corre por su cuenta y no se reusa.
  numero integer not null unique default nextval('ruleta_ronda_numero_seq'),
  admin_id uuid not null references perfiles (id),
  nombre text not null,
  premio_concepto text,
  estado estado_ronda_ruleta not null default 'borrador',

  -- Snapshot de config al crear la ronda.
  precio_ticket numeric(12, 2) not null check (precio_ticket > 0),
  porcentaje_premio numeric(5, 2) not null,
  porcentaje_casa numeric(5, 2) not null,

  pozo_total numeric(12, 2) not null default 0 check (pozo_total >= 0),

  -- Se llenan de una sola vez en `admin_girar_ruleta`.
  ganador_ticket_id uuid,
  ganador_usuario_id uuid references perfiles (id),
  premio_monto numeric(12, 2),
  comision_monto numeric(12, 2),
  -- Ancla de la animación: instante del SERVIDOR en que arranca el giro.
  giro_inicia_en timestamptz,

  abierta_at timestamptz,
  cerrada_at timestamptz,
  girada_at timestamptz,
  finalizada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ronda_porcentajes_suman_100
    check (porcentaje_premio + porcentaje_casa = 100),
  -- Si está girando o finalizada, el ganador YA tiene que estar escrito.
  -- Es la garantía de "primero se guarda, después se anima" a nivel de tabla.
  constraint ganador_escrito_antes_de_girar check (
    (estado in ('girando', 'finalizada')) = (ganador_ticket_id is not null)
  )
);

create index if not exists idx_ruleta_rondas_estado
  on ruleta_rondas (estado, created_at desc);

comment on column ruleta_rondas.giro_inicia_en is
  'Instante del servidor en que arranca la animación (0048). Todos los clientes anclan el giro a esta marca, así ven el mismo resultado en el mismo momento aunque se enteren en distinto momento.';
comment on column ruleta_rondas.comision_monto is
  'Lo que se queda la casa en esta ronda (0048). No va a comisiones_plataforma a propósito — ver la cabecera de la migración.';

-- ---------------------------------------------------------------------------
-- ruleta_tickets
--
-- El código se arma con el número de ronda y el correlativo del ticket, así
-- es único POR CONSTRUCCIÓN. Un código aleatorio obligaría a manejar
-- colisiones justo en medio de una compra que ya descontó saldo.
-- ---------------------------------------------------------------------------

create table if not exists ruleta_tickets (
  id uuid primary key default gen_random_uuid(),
  ronda_id uuid not null references ruleta_rondas (id) on delete cascade,
  usuario_id uuid not null references perfiles (id),
  -- Correlativo dentro de la ronda: 1, 2, 3… Es el orden en que se vendieron
  -- y también la posición del segmento en la rueda.
  numero integer not null,
  codigo text not null unique,
  monto numeric(12, 2) not null check (monto > 0),
  -- El admin lo agregó a mano (pagado por fuera), sin descontar saldo.
  manual boolean not null default false,
  created_at timestamptz not null default now(),
  constraint numero_unico_por_ronda unique (ronda_id, numero)
);

create index if not exists idx_ruleta_tickets_ronda on ruleta_tickets (ronda_id, numero);
create index if not exists idx_ruleta_tickets_usuario on ruleta_tickets (usuario_id, created_at desc);

-- La FK del ganador se agrega después de crear la tabla de tickets: se
-- referencian mutuamente.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ruleta_rondas_ganador_ticket_fk') then
    alter table ruleta_rondas
      add constraint ruleta_rondas_ganador_ticket_fk
      foreign key (ganador_ticket_id) references ruleta_tickets (id);
  end if;
end;
$$;

drop trigger if exists trg_ruleta_rondas_updated_at on ruleta_rondas;
create trigger trg_ruleta_rondas_updated_at before update on ruleta_rondas
  for each row execute function set_updated_at();

drop trigger if exists trg_cachudobet_config_updated_at on cachudobet_config;
create trigger trg_cachudobet_config_updated_at before update on cachudobet_config
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Estado público del juego: la rueda tiene que poder dibujar a TODOS los
-- participantes, así que cualquiera logueado lee rondas y tickets. Ninguna
-- policy de escritura: todo pasa por los RPC de abajo.
-- ---------------------------------------------------------------------------

alter table cachudobet_config enable row level security;
alter table ruleta_rondas enable row level security;
alter table ruleta_tickets enable row level security;

drop policy if exists cachudobet_config_select on cachudobet_config;
create policy cachudobet_config_select
  on cachudobet_config
  for select using (auth.role() = 'authenticated');

drop policy if exists ruleta_rondas_select on ruleta_rondas;
create policy ruleta_rondas_select
  on ruleta_rondas
  for select using (auth.role() = 'authenticated');

drop policy if exists ruleta_tickets_select on ruleta_tickets;
create policy ruleta_tickets_select
  on ruleta_tickets
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- ahora_servidor: el reloj contra el que se mide la animación.
--
-- `giro_inicia_en` lo escribe Postgres con su `now()`. Si el cliente midiera
-- contra el reloj del servidor de Next —o peor, contra el del navegador— dos
-- pantallas con relojes distintos frenarían en momentos distintos. Con esto
-- todos miden contra el MISMO reloj que fijó la marca.
-- ---------------------------------------------------------------------------

create or replace function ahora_servidor()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

revoke all on function ahora_servidor() from public;
grant execute on function ahora_servidor() to service_role;

-- ---------------------------------------------------------------------------
-- admin_guardar_config: los parámetros de los dos juegos nuevos.
-- ---------------------------------------------------------------------------

create or replace function admin_guardar_config(
  p_admin_id uuid,
  p_precio_ticket numeric,
  p_porcentaje_premio numeric,
  p_cara_sello_multiplicador numeric,
  p_cara_sello_min numeric,
  p_cara_sello_max numeric
)
returns cachudobet_config
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config cachudobet_config%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede cambiar la configuración' using errcode = 'P0300';
  end if;
  if p_precio_ticket is null or p_precio_ticket <= 0 then
    raise exception 'El precio del ticket debe ser mayor a 0' using errcode = 'P0301';
  end if;
  if p_porcentaje_premio is null or p_porcentaje_premio < 0 or p_porcentaje_premio > 100 then
    raise exception 'El porcentaje del premio va entre 0 y 100' using errcode = 'P0302';
  end if;
  if p_cara_sello_multiplicador is null or p_cara_sello_multiplicador <= 1 then
    raise exception 'El multiplicador debe ser mayor a 1' using errcode = 'P0303';
  end if;
  if p_cara_sello_min is null or p_cara_sello_min <= 0 or p_cara_sello_max < p_cara_sello_min then
    raise exception 'El rango de apuesta de cara o sello es inválido' using errcode = 'P0304';
  end if;

  update cachudobet_config
    set precio_ticket = round(p_precio_ticket, 2),
        porcentaje_premio = round(p_porcentaje_premio, 2),
        -- La casa es siempre el complemento: dos campos libres se
        -- desincronizan y el check de suma 100 rebota sin explicar nada.
        porcentaje_casa = round(100 - p_porcentaje_premio, 2),
        cara_sello_multiplicador = round(p_cara_sello_multiplicador, 2),
        cara_sello_min = round(p_cara_sello_min, 2),
        cara_sello_max = round(p_cara_sello_max, 2)
    where id
    returning * into v_config;

  return v_config;
end;
$$;

revoke all on function admin_guardar_config(uuid, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function admin_guardar_config(uuid, numeric, numeric, numeric, numeric, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- admin_guardar_ronda: crea (p_ronda_id null) o edita nombre y premio.
--
-- Solo se edita mientras no haya girado: cambiarle el nombre a una ronda ya
-- sorteada reescribiría el historial que la gente vio.
-- ---------------------------------------------------------------------------

create or replace function admin_guardar_ronda(
  p_admin_id uuid,
  p_ronda_id uuid,
  p_nombre text,
  p_premio_concepto text
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config cachudobet_config%rowtype;
  v_ronda ruleta_rondas%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede crear rondas' using errcode = 'P0310';
  end if;
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'Ponle un nombre a la ronda' using errcode = 'P0311';
  end if;

  if p_ronda_id is null then
    select * into v_config from cachudobet_config where id;

    insert into ruleta_rondas (
      admin_id, nombre, premio_concepto,
      precio_ticket, porcentaje_premio, porcentaje_casa
    )
    values (
      p_admin_id,
      trim(p_nombre),
      nullif(trim(coalesce(p_premio_concepto, '')), ''),
      v_config.precio_ticket,
      v_config.porcentaje_premio,
      v_config.porcentaje_casa
    )
    returning * into v_ronda;
  else
    select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
    if not found then
      raise exception 'Ronda no encontrada' using errcode = 'P0312';
    end if;
    if v_ronda.ganador_ticket_id is not null then
      raise exception 'Esta ronda ya se sorteó: no se puede editar' using errcode = 'P0313';
    end if;

    update ruleta_rondas
      set nombre = trim(p_nombre),
          premio_concepto = nullif(trim(coalesce(p_premio_concepto, '')), '')
      where id = p_ronda_id
      returning * into v_ronda;
  end if;

  return v_ronda;
end;
$$;

revoke all on function admin_guardar_ronda(uuid, uuid, text, text) from public;
grant execute on function admin_guardar_ronda(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- admin_cambiar_estado_ronda: abrir o cerrar.
--
-- Una sola función porque las dos son la misma transición validada, y así el
-- panel manda un solo tipo de llamada. Se puede reabrir una ronda cerrada
-- (mientras no haya girado) — cerrar por error es el clic más fácil de dar.
-- ---------------------------------------------------------------------------

create or replace function admin_cambiar_estado_ronda(
  p_admin_id uuid,
  p_ronda_id uuid,
  p_estado text
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda ruleta_rondas%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0320';
  end if;
  if p_estado not in ('abierta', 'cerrada') then
    raise exception 'Estado inválido' using errcode = 'P0321';
  end if;

  select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
  if not found then
    raise exception 'Ronda no encontrada' using errcode = 'P0322';
  end if;
  if v_ronda.ganador_ticket_id is not null then
    raise exception 'Esta ronda ya se sorteó' using errcode = 'P0323';
  end if;

  update ruleta_rondas
    set estado = p_estado::estado_ronda_ruleta,
        abierta_at = case when p_estado = 'abierta' then coalesce(abierta_at, now()) else abierta_at end,
        cerrada_at = case when p_estado = 'cerrada' then now() else null end
    where id = p_ronda_id
    returning * into v_ronda;

  return v_ronda;
end;
$$;

revoke all on function admin_cambiar_estado_ronda(uuid, uuid, text) from public;
grant execute on function admin_cambiar_estado_ronda(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- comprar_tickets_ruleta: el jugador compra con su saldo.
--
-- El monto tiene que ser múltiplo EXACTO del precio del ticket. Redondear
-- para abajo y quedarse con el vuelto sería quedarse con plata ajena sin
-- avisar; rebotar con un mensaje claro es mejor.
--
-- Devuelve los tickets creados para poder mostrarle sus códigos.
-- ---------------------------------------------------------------------------

create or replace function comprar_tickets_ruleta(
  p_usuario_id uuid,
  p_ronda_id uuid,
  p_monto numeric
)
returns setof ruleta_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda ruleta_rondas%rowtype;
  v_perfil perfiles%rowtype;
  v_cantidad integer;
  v_ultimo integer;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0330';
  end if;
  p_monto := round(p_monto, 2);

  select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
  if not found then
    raise exception 'Ronda no encontrada' using errcode = 'P0331';
  end if;
  if v_ronda.estado <> 'abierta' then
    raise exception 'Esta ronda no está abierta' using errcode = 'P0332';
  end if;

  if mod(p_monto, v_ronda.precio_ticket) <> 0 then
    raise exception 'El monto debe ser múltiplo de S/%', trim(to_char(v_ronda.precio_ticket, 'FM999999990.00'))
      using errcode = 'P0333';
  end if;

  v_cantidad := (p_monto / v_ronda.precio_ticket)::integer;
  if v_cantidad < 1 then
    raise exception 'Necesitas comprar al menos un ticket' using errcode = 'P0334';
  end if;
  -- Tope por operación: una compra de miles de tickets es casi siempre un
  -- monto mal tipeado, y cada ticket es una fila.
  if v_cantidad > 500 then
    raise exception 'Máximo 500 tickets por compra' using errcode = 'P0335';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0336';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede participar' using errcode = 'P0337';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0338';
  end if;
  -- Solo saldo real: el fake no entra al pozo (ver cabecera).
  if v_perfil.saldo_disponible < p_monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0339';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible - p_monto
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (p_usuario_id, 'ticket_ruleta', p_monto, false);

  select coalesce(max(numero), 0) into v_ultimo
  from ruleta_tickets where ronda_id = p_ronda_id;

  return query
  with nuevos as (
    insert into ruleta_tickets (ronda_id, usuario_id, numero, codigo, monto)
    select
      p_ronda_id,
      p_usuario_id,
      v_ultimo + i,
      lpad(v_ronda.numero::text, 4, '0') || '-' || lpad((v_ultimo + i)::text, 5, '0'),
      v_ronda.precio_ticket
    from generate_series(1, v_cantidad) as i
    returning *
  )
  select * from nuevos order by numero;

  update ruleta_rondas
    set pozo_total = pozo_total + p_monto
    where id = p_ronda_id;

  return;
end;
$$;

revoke all on function comprar_tickets_ruleta(uuid, uuid, numeric) from public;
grant execute on function comprar_tickets_ruleta(uuid, uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- admin_agregar_tickets: tickets pagados POR FUERA (efectivo).
--
-- No descuenta saldo — la plata entró por otro lado, igual que un ingreso
-- registrado a mano (0044). Sí suma al pozo, porque el premio se calcula
-- sobre el total recaudado.
-- ---------------------------------------------------------------------------

create or replace function admin_agregar_tickets(
  p_admin_id uuid,
  p_ronda_id uuid,
  p_usuario_id uuid,
  p_cantidad integer
)
returns setof ruleta_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda ruleta_rondas%rowtype;
  v_perfil perfiles%rowtype;
  v_ultimo integer;
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0340';
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad debe ser al menos 1' using errcode = 'P0341';
  end if;
  if p_cantidad > 500 then
    raise exception 'Máximo 500 tickets por operación' using errcode = 'P0342';
  end if;

  select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
  if not found then
    raise exception 'Ronda no encontrada' using errcode = 'P0343';
  end if;
  if v_ronda.estado not in ('borrador', 'abierta') then
    raise exception 'Esta ronda ya no acepta tickets' using errcode = 'P0344';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id;
  if not found then
    raise exception 'Jugador no encontrado' using errcode = 'P0345';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede participar' using errcode = 'P0346';
  end if;

  select coalesce(max(numero), 0) into v_ultimo
  from ruleta_tickets where ronda_id = p_ronda_id;

  return query
  with nuevos as (
    insert into ruleta_tickets (ronda_id, usuario_id, numero, codigo, monto, manual)
    select
      p_ronda_id,
      p_usuario_id,
      v_ultimo + i,
      lpad(v_ronda.numero::text, 4, '0') || '-' || lpad((v_ultimo + i)::text, 5, '0'),
      v_ronda.precio_ticket,
      true
    from generate_series(1, p_cantidad) as i
    returning *
  )
  select * from nuevos order by numero;

  update ruleta_rondas
    set pozo_total = pozo_total + (v_ronda.precio_ticket * p_cantidad)
    where id = p_ronda_id;

  return;
end;
$$;

revoke all on function admin_agregar_tickets(uuid, uuid, uuid, integer) from public;
grant execute on function admin_agregar_tickets(uuid, uuid, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- admin_girar_ruleta: EL sorteo. Elige, paga y deja escrito el ganador.
--
-- Cuatro cosas que garantiza y que el navegador no podría:
--   1. El ganador sale de `random()` en Postgres, no del cliente.
--   2. `ganador_ticket_id is null` + `for update` hacen imposible el doble
--      giro: dos clics simultáneos, el segundo encuentra la fila ya escrita.
--   3. El premio se paga en la MISMA transacción en que se elige.
--   4. `giro_inicia_en` se fija recién al final: cuando el primer cliente se
--      entera de que hay que animar, el ganador ya está en la base.
--
-- La comisión es el RESTO (pozo − premio), no un segundo `round()`. Con
-- pozo 100.01 y 80/20, redondear las dos partes por separado deja un céntimo
-- flotando; así siempre suman exacto.
-- ---------------------------------------------------------------------------

create or replace function admin_girar_ruleta(
  p_admin_id uuid,
  p_ronda_id uuid
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda ruleta_rondas%rowtype;
  v_ticket ruleta_tickets%rowtype;
  v_premio numeric(12, 2);
  v_comision numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede girar la ruleta' using errcode = 'P0350';
  end if;

  select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
  if not found then
    raise exception 'Ronda no encontrada' using errcode = 'P0351';
  end if;
  if v_ronda.ganador_ticket_id is not null then
    raise exception 'Esta ronda ya se giró' using errcode = 'P0352';
  end if;
  if v_ronda.estado <> 'cerrada' then
    raise exception 'Cierra la ronda antes de girar' using errcode = 'P0353';
  end if;

  -- Uniforme sobre las filas: cada ticket es una fila, así que tener más
  -- tickets ES tener más chances.
  select * into v_ticket
  from ruleta_tickets
  where ronda_id = p_ronda_id
  order by random()
  limit 1;

  if not found then
    raise exception 'No hay tickets en esta ronda' using errcode = 'P0354';
  end if;

  v_premio := round(v_ronda.pozo_total * v_ronda.porcentaje_premio / 100, 2);
  v_comision := v_ronda.pozo_total - v_premio;

  if v_premio > 0 then
    update perfiles
      set saldo_disponible = saldo_disponible + v_premio
      where id = v_ticket.usuario_id;

    insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
    values (v_ticket.usuario_id, 'premio_ruleta', v_premio, false);
  end if;

  update ruleta_rondas
    set estado = 'girando',
        ganador_ticket_id = v_ticket.id,
        ganador_usuario_id = v_ticket.usuario_id,
        premio_monto = v_premio,
        comision_monto = v_comision,
        girada_at = now(),
        giro_inicia_en = now() + interval '3 seconds'
    where id = p_ronda_id
    returning * into v_ronda;

  return v_ronda;
end;
$$;

revoke all on function admin_girar_ruleta(uuid, uuid) from public;
grant execute on function admin_girar_ruleta(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- admin_finalizar_ronda: cierra la ronda para el historial.
--
-- El premio ya se pagó en `admin_girar_ruleta`. Esto NO mueve plata: solo
-- saca la ronda de la pantalla de juego. Separarlo del giro deja que la
-- animación y el modal del ganador se queden en pantalla el tiempo que haga
-- falta antes de pasar a la siguiente.
-- ---------------------------------------------------------------------------

create or replace function admin_finalizar_ronda(
  p_admin_id uuid,
  p_ronda_id uuid
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda ruleta_rondas%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'No autorizado' using errcode = 'P0360';
  end if;

  update ruleta_rondas
    set estado = 'finalizada', finalizada_at = now()
    where id = p_ronda_id and estado = 'girando'
    returning * into v_ronda;

  if not found then
    raise exception 'Solo se finaliza una ronda que ya giró' using errcode = 'P0361';
  end if;

  return v_ronda;
end;
$$;

revoke all on function admin_finalizar_ronda(uuid, uuid) from public;
grant execute on function admin_finalizar_ronda(uuid, uuid) to service_role;
