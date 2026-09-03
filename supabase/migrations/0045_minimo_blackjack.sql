-- =============================================================================
-- LA PANCA — Mínimo por categoría: blackjack desde S/5
-- 0045_minimo_blackjack.sql
--
-- El mínimo era S/10 para todo. En blackjack se juega mano tras mano, así
-- que 10 por mano es mucho: baja a 5. El resto de categorías se queda en
-- 10.
--
-- DE PASO ARREGLA UNA MENTIRA VIEJA. `src/types/index.ts` declaraba
-- `BET_MIN = 5` y toda la UI prometía "apuesta mínima S/5", pero
-- `crear_apuesta` rechazaba cualquier cosa bajo 10 desde 0016. Una apuesta
-- de 5 pasaba el formulario, pasaba Zod, y recién moría en Postgres con un
-- error que no explicaba nada. Ahora los dos mínimos son de verdad y el
-- TypeScript los tiene separados (`BET_MIN` y `BET_MIN_BLACKJACK`).
--
-- Mismo cuerpo de 0039 con el mínimo calculado por categoría.
-- =============================================================================

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
  v_minimo numeric(12, 2);
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0' using errcode = 'P0001';
  end if;
  p_monto := round(p_monto, 2);

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;

  -- El mínimo depende de la categoría; el máximo no cambia.
  v_minimo := case when v_evento.categoria = 'blackjack' then 5 else 10 end;
  if p_monto < v_minimo or p_monto > 100 then
    raise exception 'La apuesta debe estar entre S/% y S/100', v_minimo
      using errcode = 'P0007';
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

  -- Blackjack: la mesa es de dos personas, una por lado. El monto sí se
  -- empareja parcial como en todo el resto — lo que se limita es cuánta
  -- gente se sienta.
  if v_evento.categoria = 'blackjack' and exists (
    select 1 from apuestas
    where evento_id = p_evento_id
      and lado = p_lado
      and estado <> 'cancelada'
  ) then
    raise exception 'Ese asiento ya está ocupado' using errcode = 'P0260';
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
