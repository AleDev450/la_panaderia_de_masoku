-- =============================================================================
-- CACHUDOBET — La moneda cae sola 5 segundos después de llenarse la mesa
-- 0059_cara_sello_lanza_sola.sql
--
-- QUÉ CAMBIA respecto de 0053. Ahí la mesa quedaba `lista` esperando a que el
-- staff apretara "Lanzar moneda". En la práctica eso obliga a alguien a estar
-- mirando el panel para que la partida avance, y dos jugadores sentados
-- esperando a un tercero es la forma más rápida de que se aburran y se vayan.
--
-- Ahora se resuelve al sentarse el rival, pero la animación no arranca hasta
-- 5 segundos después: alcanza para que los dos vean quién les tocó, para la
-- cuenta regresiva, y para que el poll de las dos pantallas llegue a la
-- largada.
--
-- EL RESULTADO SIGUE SALIENDO DE POSTGRES Y SIGUE ESCRIBIÉNDOSE ANTES. Es la
-- misma garantía de siempre: cuando la primera pantalla se entera de que hay
-- que animar, la moneda ya cayó acá. Lo único que se movió es QUIÉN dispara —
-- antes el staff, ahora el segundo jugador al sentarse.
--
-- El estado `lista` deja de usarse en la práctica, pero NO se saca del check:
-- las mesas viejas que quedaron en ese estado seguirían siendo válidas, y
-- borrar el valor las volvería ilegibles.
--
-- `admin_lanzar_moneda` (0053) se conserva a propósito: si una mesa quedó en
-- `lista` de antes, el staff todavía puede resolverla a mano.
-- =============================================================================

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

  -- Los DOS perfiles, siempre en el mismo orden (por id): sin esto, dos mesas
  -- cruzadas resueltas a la vez pueden entrar en deadlock.
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

  -- El rival pone su parte. Se retiene y se libera en la misma transacción,
  -- pero el movimiento queda igual: así el historial muestra las dos patas de
  -- la apuesta y no un pago que salió de la nada.
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
  -- La comisión es el RESTO del pozo, no un segundo redondeo.
  v_comision := (v_sala.monto * 2) - v_premio;

  update perfiles
    set saldo_retenido = saldo_retenido - v_sala.monto
    where id in (v_sala.creador_id, p_usuario_id);

  update perfiles
    set saldo_disponible = saldo_disponible + v_premio
    where id = v_ganador;

  insert into movimientos_saldo (usuario_id, tipo, monto, es_fake)
  values (v_ganador, 'premio_cara_sello', v_premio, false);

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
        resuelta_at = now(),
        -- Los 5 segundos: la mesa se ve completa, corre la cuenta regresiva y
        -- recién ahí gira. Se fija al final, con el resultado ya guardado.
        lanza_inicia_en = now() + interval '5 seconds'
    where id = p_sala_id
    returning * into v_sala;

  return v_sala;
end;
$$;

revoke all on function unirse_cara_sello(uuid, uuid) from public;
grant execute on function unirse_cara_sello(uuid, uuid) to service_role;
