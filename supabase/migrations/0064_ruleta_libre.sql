-- =============================================================================
-- CACHUDOBET — Ruleta libre: la crea un jugador y gira sola
-- 0064_ruleta_libre.sql
--
-- DOS RULETAS, UN SOLO MOTOR:
--
--   modo = 'ruleta'  → RULETA SEMANAL. La crea el staff y el staff decide
--                      cuándo girar. Es la de siempre.
--   modo = 'libre'   → RULETA LIBRE. La crea cualquier jugador con saldo. Al
--                      juntarse 2 jugadores arranca una cuenta de 10 minutos,
--                      y al vencer gira y paga sola.
--   modo = 'carrera' → caballitos (0058).
--
-- Comparten tabla, pozo, compra de tickets y la fórmula de premio de 0051. Lo
-- único que cambia es quién la crea y quién dispara el giro.
--
-- QUIÉN DISPARA EL GIRO SIN pg_cron. El proyecto no tiene tareas programadas
-- (ver README), así que se usa el mismo patrón que la ventana de corrección de
-- eventos (0013): lo dispara el propio cliente. Cualquiera que tenga la
-- pantalla abierta y vea la hora vencida llama a `girar_ruleta_libre`.
--
-- Eso es seguro porque la función NO confía en quien llama:
--   · solo gira si `gira_en` ya pasó — nadie puede adelantarla;
--   · solo gira una vez — si otro se adelantó, DEVUELVE la ronda ya girada en
--     vez de fallar, así diez pestañas llamando a la vez no producen diez
--     errores ni dos ganadores;
--   · el ganador lo elige Postgres, no el que llamó.
--
-- LO QUE ESTE DISEÑO NO RESUELVE, y conviene saberlo: si nadie abre la
-- pantalla después de que venza el reloj, la ronda se queda esperando. No se
-- pierde ni se paga de más — gira en cuanto alguien entre—, pero puede girar
-- tarde. Es la misma limitación que ya tiene el pago automático de eventos.
--
-- LA CUENTA ARRANCA AL SEGUNDO JUGADOR, no al crearse: una ruleta con una sola
-- persona no tiene contra quién sortear, y el que la abrió se llevaría su
-- propia plata menos la comisión.
-- =============================================================================

alter table ruleta_rondas
  add column if not exists gira_en timestamptz;

comment on column ruleta_rondas.gira_en is
  'Cuándo gira sola una ruleta libre (0064). Se fija al entrar el 2º jugador. Null en las que maneja el staff.';

-- El modo nuevo entra al check.
alter table ruleta_rondas drop constraint if exists modo_conocido;
alter table ruleta_rondas
  add constraint modo_conocido check (modo in ('ruleta', 'carrera', 'libre'));

create index if not exists idx_rondas_libres_por_girar
  on ruleta_rondas (gira_en)
  where modo = 'libre' and ganador_ticket_id is null;

-- ---------------------------------------------------------------------------
-- Cuántos minutos corre el reloj y cuántos jugadores hacen falta.
--
-- Van en la config y no clavados en la función para poder ajustarlos sin
-- migrar, igual que el resto de los números del juego.
-- ---------------------------------------------------------------------------

alter table cachudobet_config
  add column if not exists libre_minutos integer not null default 10,
  add column if not exists libre_min_jugadores integer not null default 2;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'libre_parametros_validos') then
    alter table cachudobet_config
      add constraint libre_parametros_validos
      check (libre_minutos between 1 and 1440 and libre_min_jugadores >= 2);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- crear_ronda_libre: un jugador abre su ruleta y entra con sus tickets.
--
-- Crear y comprar van juntos a propósito: una ruleta libre sin su creador
-- adentro sería una sala vacía que nadie sabe si está viva. Al terminar, quien
-- la creó ya es el jugador 1.
-- ---------------------------------------------------------------------------

create or replace function crear_ronda_libre(
  p_usuario_id uuid,
  p_nombre text,
  p_precio_ticket numeric,
  p_monto numeric
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config cachudobet_config%rowtype;
  v_perfil perfiles%rowtype;
  v_ronda ruleta_rondas%rowtype;
  v_precio numeric(12, 2);
begin
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'Ponle un nombre a tu ruleta' using errcode = 'P0350';
  end if;

  select * into v_perfil from perfiles where id = p_usuario_id for update;
  if not found then
    raise exception 'Perfil de usuario no encontrado' using errcode = 'P0351';
  end if;
  if v_perfil.rol = 'admin' then
    raise exception 'Un administrador no puede crear una ruleta libre' using errcode = 'P0352';
  end if;
  if v_perfil.baneado then
    raise exception 'Tu cuenta está suspendida' using errcode = 'P0353';
  end if;

  select * into v_config from cachudobet_config where id;
  v_precio := round(coalesce(nullif(p_precio_ticket, 0), v_config.precio_ticket), 2);

  if v_precio <= 0 then
    raise exception 'El precio del ticket debe ser mayor a 0' using errcode = 'P0354';
  end if;
  if v_precio > 100 then
    raise exception 'En una ruleta libre el ticket no puede pasar de S/100'
      using errcode = 'P0355';
  end if;

  -- Solo una ruleta libre por persona a la vez. Sin esto, alguien abre veinte
  -- y deja la pantalla llena de salas muertas que nunca juntan 2 jugadores.
  if exists (
    select 1 from ruleta_rondas
    where modo = 'libre'
      and admin_id = p_usuario_id
      and ganador_ticket_id is null
      and estado <> 'cancelada'
  ) then
    raise exception 'Ya tienes una ruleta libre abierta' using errcode = 'P0356';
  end if;

  -- `admin_id` guarda a quien la creó, sea staff o jugador: la columna ya
  -- existía y renombrarla obligaría a tocar todo lo que la usa.
  insert into ruleta_rondas (
    admin_id, nombre, premio_concepto,
    precio_ticket, porcentaje_premio, porcentaje_casa, modo, estado, abierta_at
  )
  values (
    p_usuario_id,
    trim(p_nombre),
    'Se reparte el pozo',
    v_precio,
    v_config.porcentaje_premio,
    v_config.porcentaje_casa,
    'libre',
    'abierta',
    now()
  )
  returning * into v_ronda;

  -- El creador entra de una. Si no le alcanza el saldo, la compra levanta la
  -- excepción y la ronda no llega a existir: todo está en la misma transacción.
  perform comprar_tickets_ruleta(p_usuario_id, v_ronda.id, p_monto);

  select * into v_ronda from ruleta_rondas where id = v_ronda.id;
  return v_ronda;
end;
$$;

revoke all on function crear_ronda_libre(uuid, text, numeric, numeric) from public;
grant execute on function crear_ronda_libre(uuid, text, numeric, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- comprar_tickets_ruleta: arranca el reloj y cierra la puerta a tiempo.
--
-- Mismo cuerpo de 0063 con dos agregados, los dos solo para `modo = 'libre'`:
--   · no se puede comprar una vez vencido el reloj;
--   · al llegar al mínimo de jugadores distintos, se fija `gira_en`.
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
  v_config cachudobet_config%rowtype;
  v_cantidad integer;
  v_ultimo integer;
  v_ya integer;
  v_jugadores integer;
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

  -- Ruleta libre: con el reloj vencido ya no entra nadie más. Si no, alguien
  -- podría comprar justo mientras se está sorteando.
  if v_ronda.modo = 'libre' and v_ronda.gira_en is not null and now() >= v_ronda.gira_en then
    raise exception 'Esta ruleta ya cerró: está por girar' using errcode = 'P0357';
  end if;

  if mod(p_monto, v_ronda.precio_ticket) <> 0 then
    raise exception 'El monto debe ser múltiplo de S/%', trim(to_char(v_ronda.precio_ticket, 'FM999999990.00'))
      using errcode = 'P0333';
  end if;

  v_cantidad := (p_monto / v_ronda.precio_ticket)::integer;
  if v_cantidad < 1 then
    raise exception 'Necesitas comprar al menos un ticket' using errcode = 'P0334';
  end if;
  if v_cantidad > 500 then
    raise exception 'Máximo 500 tickets por compra' using errcode = 'P0335';
  end if;

  if v_ronda.max_tickets_por_persona is not null then
    select count(*) into v_ya
    from ruleta_tickets
    where ronda_id = p_ronda_id and usuario_id = p_usuario_id;

    if v_ya + v_cantidad > v_ronda.max_tickets_por_persona then
      raise exception
        'En esta ronda el máximo es % por persona y ya tienes %: puedes llevar % más',
        v_ronda.max_tickets_por_persona,
        v_ya,
        greatest(v_ronda.max_tickets_por_persona - v_ya, 0)
        using errcode = 'P0340';
    end if;
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

  -- El reloj arranca al juntarse el mínimo de jugadores DISTINTOS, y una sola
  -- vez: comprar más tickets después no lo reinicia.
  if v_ronda.modo = 'libre' and v_ronda.gira_en is null then
    select * into v_config from cachudobet_config where id;

    select count(distinct usuario_id) into v_jugadores
    from ruleta_tickets where ronda_id = p_ronda_id;

    if v_jugadores >= v_config.libre_min_jugadores then
      update ruleta_rondas
        set gira_en = now() + make_interval(mins => v_config.libre_minutos)
        where id = p_ronda_id;
    end if;
  end if;

  return;
end;
$$;

revoke all on function comprar_tickets_ruleta(uuid, uuid, numeric) from public;
grant execute on function comprar_tickets_ruleta(uuid, uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- girar_ruleta_libre: el giro automático.
--
-- La puede llamar cualquiera con sesión, y por eso no confía en nadie: si el
-- reloj no venció, no gira. Si ya giró, DEVUELVE la ronda en vez de fallar —
-- diez pestañas llamando a la vez tienen que producir un solo ganador y cero
-- errores, no diez excepciones.
--
-- El reparto es el de 0051: el ganador recupera lo suyo y se lleva el % de lo
-- ajeno.
-- ---------------------------------------------------------------------------

create or replace function girar_ruleta_libre(p_ronda_id uuid)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda ruleta_rondas%rowtype;
  v_ticket ruleta_tickets%rowtype;
  v_jugadores integer;
  v_aporte_ganador numeric(12, 2);
  v_premio numeric(12, 2);
  v_comision numeric(12, 2);
begin
  select * into v_ronda from ruleta_rondas where id = p_ronda_id for update;
  if not found then
    raise exception 'Ronda no encontrada' using errcode = 'P0360';
  end if;
  if v_ronda.modo <> 'libre' then
    raise exception 'Esta ronda no es una ruleta libre' using errcode = 'P0361';
  end if;

  -- Alguien se adelantó: no es un error, es la carrera esperada.
  if v_ronda.ganador_ticket_id is not null then
    return v_ronda;
  end if;

  if v_ronda.estado = 'cancelada' then
    raise exception 'Esta ruleta fue cancelada' using errcode = 'P0362';
  end if;
  if v_ronda.gira_en is null then
    raise exception 'Todavía no hay jugadores suficientes' using errcode = 'P0363';
  end if;
  if now() < v_ronda.gira_en then
    raise exception 'Todavía no es hora de girar' using errcode = 'P0364';
  end if;

  select count(distinct usuario_id) into v_jugadores
  from ruleta_tickets where ronda_id = p_ronda_id;
  if v_jugadores < 2 then
    raise exception 'Hacen falta al menos 2 jugadores' using errcode = 'P0365';
  end if;

  -- Uniforme sobre las filas: cada ticket es una fila, así que tener más
  -- tickets ES tener más chances.
  select * into v_ticket
  from ruleta_tickets
  where ronda_id = p_ronda_id
  order by random()
  limit 1;

  select coalesce(sum(monto), 0) into v_aporte_ganador
  from ruleta_tickets
  where ronda_id = p_ronda_id and usuario_id = v_ticket.usuario_id;

  -- 0051: lo suyo vuelve entero, la comisión sale solo de lo ajeno.
  v_premio := round(
    v_aporte_ganador
      + (v_ronda.pozo_total - v_aporte_ganador) * v_ronda.porcentaje_premio / 100,
    2
  );
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

revoke all on function girar_ruleta_libre(uuid) from public;
grant execute on function girar_ruleta_libre(uuid) to service_role;
