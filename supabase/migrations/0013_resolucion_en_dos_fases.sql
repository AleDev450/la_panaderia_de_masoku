-- =============================================================================
-- LA PANCA — Un lado por sala + resolución en dos fases
-- 0013_resolucion_en_dos_fases.sql
--
-- 1. UN SOLO LADO POR SALA. `crear_apuesta` ya evitaba emparejarte contigo
--    mismo, pero nada impedía apostar a los dos lados del mismo título
--    (cubriéndote de la pérdida y dejando órdenes basura en el libro).
--    Ahora, si ya tienes una apuesta viva en un lado, el otro te rechaza.
--
-- 2. DECLARAR YA NO PAGA AL INSTANTE. Antes un clic equivocado liquidaba
--    el evento entero y no había vuelta atrás. Ahora son dos fases:
--
--      declarar  → guarda un resultado PRELIMINAR, sin mover un sol,
--                  y abre una ventana de 1 minuto.
--      corregir  → dentro de esa ventana se puede cambiar el ganador
--                  UNA sola vez (el contador se reinicia para poder
--                  revisar la corrección). Una segunda corrección se
--                  rechaza.
--      confirmar → recién acá se paga, con el resultado preliminar
--                  vigente. También se puede liquidar en lote lo que ya
--                  venció (`liquidar_eventos_vencidos`).
--
--    Pagar dos veces sigue siendo imposible: la liquidación exige que el
--    evento no esté `resuelto`, y lo marca como tal dentro de la misma
--    transacción en la que mueve el dinero.
-- =============================================================================

alter table eventos
  add column if not exists resultado_preliminar lado_apuesta,
  add column if not exists declarado_at timestamptz,
  add column if not exists correcciones smallint not null default 0;

-- ---------------------------------------------------------------------------
-- crear_apuesta: se agrega el rechazo del lado contrario. Se repite la
-- función entera porque `create or replace` reemplaza el cuerpo completo.
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

  -- En una sala eliges un bando y te quedas ahí. Apostar a los dos lados
  -- sería cubrirse a sí mismo: pase lo que pase recuperas parte, y de paso
  -- ensucias el libro con órdenes que nunca deberían emparejar.
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
  if v_perfil.saldo_disponible < p_monto then
    raise exception 'Saldo disponible insuficiente' using errcode = 'P0005';
  end if;

  update perfiles
    set saldo_disponible = saldo_disponible - p_monto,
        saldo_retenido = saldo_retenido + p_monto
    where id = p_usuario_id;

  insert into movimientos_saldo (usuario_id, tipo, monto, evento_id)
  values (p_usuario_id, 'retencion', p_monto, p_evento_id);

  insert into apuestas (evento_id, usuario_id, lado, monto_total, monto_matcheado, monto_pendiente, estado)
  values (p_evento_id, p_usuario_id, p_lado, p_monto, 0, p_monto, 'pendiente')
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
-- liquidar_evento: el motor de pago, sin chequeo de admin.
--
-- Se extrae del cuerpo de `resolver_evento` para que tanto la confirmación
-- manual como la liquidación en lote usen exactamente el mismo código —
-- dos copias del reparto de dinero es justo el tipo de duplicación que
-- termina divergiendo.
--
-- Marca el evento como `resuelto` al principio y exige que no lo estuviera:
-- eso es lo que hace imposible pagar dos veces, incluso con dos clics
-- simultáneos (la fila queda bloqueada con `for update`).
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
  v_comision_total numeric(12, 2);
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
    update perfiles
      set saldo_disponible = saldo_disponible + v_apuesta.monto_pendiente,
          saldo_retenido = saldo_retenido - v_apuesta.monto_pendiente
      where id = v_apuesta.usuario_id;

    insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id)
    values (v_apuesta.usuario_id, 'devolucion', v_apuesta.monto_pendiente, v_apuesta.id, p_evento_id);

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

      update perfiles
        set saldo_disponible = saldo_disponible + v_payout,
            saldo_retenido = saldo_retenido - v_apuesta.monto_matcheado,
            puntos = puntos + 5
        where id = v_apuesta.usuario_id;

      insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id)
      values (v_apuesta.usuario_id, 'pago_ganancia', v_payout, v_apuesta.id, p_evento_id);
    else
      update perfiles
        set saldo_retenido = saldo_retenido - v_apuesta.monto_matcheado,
            puntos = puntos + 1
        where id = v_apuesta.usuario_id;
    end if;
  end loop;

  select coalesce(round(sum(monto) * 0.20, 2), 0) into v_comision_total
  from emparejamientos
  where evento_id = p_evento_id;

  insert into comisiones_plataforma (evento_id, monto)
  values (p_evento_id, v_comision_total);
end;
$$;

revoke all on function liquidar_evento(uuid, lado_apuesta) from public;
grant execute on function liquidar_evento(uuid, lado_apuesta) to service_role;

-- ---------------------------------------------------------------------------
-- Fase 1: declarar (no paga)
-- ---------------------------------------------------------------------------

create or replace function admin_declarar_resultado(
  p_admin_id uuid,
  p_evento_id uuid,
  p_resultado lado_apuesta
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede declarar resultados' using errcode = 'P0101';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0102';
  end if;
  if v_evento.estado = 'resuelto' then
    raise exception 'El evento ya fue pagado' using errcode = 'P0103';
  end if;
  if v_evento.resultado_preliminar is not null then
    raise exception 'Este evento ya tiene un resultado declarado' using errcode = 'P0104';
  end if;

  update eventos
    set estado = 'cerrado',
        resultado_preliminar = p_resultado,
        declarado_at = now(),
        correcciones = 0
    where id = p_evento_id
    returning * into v_evento;

  return v_evento;
end;
$$;

revoke all on function admin_declarar_resultado(uuid, uuid, lado_apuesta) from public;
grant execute on function admin_declarar_resultado(uuid, uuid, lado_apuesta) to service_role;

-- ---------------------------------------------------------------------------
-- Fase 2 (opcional): corregir, una sola vez
--
-- Reinicia `declarado_at` para dar otro minuto de revisión sobre la
-- corrección: si no, corregir en el segundo 58 dejaría dos segundos para
-- darse cuenta de que la corrección también estaba mal.
-- ---------------------------------------------------------------------------

create or replace function admin_corregir_resultado(
  p_admin_id uuid,
  p_evento_id uuid,
  p_resultado lado_apuesta
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede corregir resultados' using errcode = 'P0105';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0106';
  end if;
  if v_evento.estado = 'resuelto' then
    raise exception 'El evento ya fue pagado, no se puede corregir' using errcode = 'P0107';
  end if;
  if v_evento.resultado_preliminar is null then
    raise exception 'Este evento todavía no tiene resultado declarado' using errcode = 'P0108';
  end if;
  if v_evento.correcciones >= 1 then
    raise exception 'Este resultado ya se corrigió una vez' using errcode = 'P0109';
  end if;
  if v_evento.resultado_preliminar = p_resultado then
    raise exception 'Ese ya es el resultado declarado' using errcode = 'P0110';
  end if;

  update eventos
    set resultado_preliminar = p_resultado,
        correcciones = correcciones + 1,
        declarado_at = now()
    where id = p_evento_id
    returning * into v_evento;

  return v_evento;
end;
$$;

revoke all on function admin_corregir_resultado(uuid, uuid, lado_apuesta) from public;
grant execute on function admin_corregir_resultado(uuid, uuid, lado_apuesta) to service_role;

-- ---------------------------------------------------------------------------
-- Fase 3: confirmar y pagar
-- ---------------------------------------------------------------------------

create or replace function admin_confirmar_pago(
  p_admin_id uuid,
  p_evento_id uuid
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede confirmar el pago' using errcode = 'P0111';
  end if;

  select * into v_evento from eventos where id = p_evento_id;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0112';
  end if;
  if v_evento.resultado_preliminar is null then
    raise exception 'Declara un resultado antes de pagar' using errcode = 'P0113';
  end if;

  -- liquidar_evento vuelve a tomar la fila con `for update` y rechaza si
  -- ya está resuelto: ahí muere cualquier intento de doble pago.
  perform liquidar_evento(p_evento_id, v_evento.resultado_preliminar);

  select * into v_evento from eventos where id = p_evento_id;
  return v_evento;
end;
$$;

revoke all on function admin_confirmar_pago(uuid, uuid) from public;
grant execute on function admin_confirmar_pago(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Liquidación en lote de lo que ya cumplió su minuto.
--
-- Sin pg_cron nadie dispara esto solo: lo llama el panel de títulos al
-- abrirse y cuando un contador llega a cero. Si nadie abre el panel, los
-- eventos quedan declarados pero sin pagar hasta que alguien lo haga —
-- por eso el pago sigue siendo, en el fondo, una acción del staff.
-- ---------------------------------------------------------------------------

create or replace function liquidar_eventos_vencidos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento record;
  v_liquidados integer := 0;
begin
  for v_evento in
    select id, resultado_preliminar
    from eventos
    where estado <> 'resuelto'
      and resultado_preliminar is not null
      and declarado_at <= now() - interval '1 minute'
  loop
    perform liquidar_evento(v_evento.id, v_evento.resultado_preliminar);
    v_liquidados := v_liquidados + 1;
  end loop;

  return v_liquidados;
end;
$$;

revoke all on function liquidar_eventos_vencidos() from public;
grant execute on function liquidar_eventos_vencidos() to service_role;

-- ---------------------------------------------------------------------------
-- resolver_evento queda como atajo de un solo paso (declara y paga), solo
-- para uso manual desde SQL. La app ya no lo llama: su flujo pasa por
-- declarar → confirmar.
-- ---------------------------------------------------------------------------

create or replace function resolver_evento(
  p_evento_id uuid,
  p_resultado lado_apuesta,
  p_admin_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede resolver un evento' using errcode = 'P0020';
  end if;

  update eventos
    set resultado_preliminar = p_resultado, declarado_at = now()
    where id = p_evento_id and estado <> 'resuelto';

  perform liquidar_evento(p_evento_id, p_resultado);
end;
$$;

revoke all on function resolver_evento(uuid, lado_apuesta, uuid) from public;
grant execute on function resolver_evento(uuid, lado_apuesta, uuid) to service_role;
