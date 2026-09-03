-- =============================================================================
-- LA PANCA — Corregir el resultado de una partida YA PAGADA
-- 0046_corregir_resultado_pagado.sql
--
-- EL HUECO. `admin_corregir_resultado` (0013) solo sirve dentro de la
-- ventana de un minuto, ANTES de confirmar el pago. Una vez pagado no
-- había forma de arreglar un ganador mal declarado: la única herramienta
-- que tocaba plata ya repartida era `admin_eliminar_evento_prueba`, que
-- BORRA la partida entera — sirve para limpiar pruebas, no para corregir
-- una mano real que sí se jugó.
--
-- CÓMO CORRIGE. No deshace y vuelve a hacer: aplica solo la DIFERENCIA
-- entre lo que cada uno cobró y lo que le tocaba. Así `saldo_retenido` ni
-- se toca (deshacer lo sumaría y rehacer lo restaría, neto cero) y hay una
-- sola escritura por jugador.
--
--   delta = premio con el resultado nuevo − premio con el viejo
--
-- Ejemplo real: mesa 1v1 con S/5 emparejados. Ganó el lado equivocado, así
-- que el que cobró 9 devuelve 9 y el otro recibe 9. Los montos SIN CUBRIR
-- no se tocan: ya volvieron al liquidar y no dependen del resultado.
--
-- LA COMISIÓN NO SE MUEVE cuando los dos lados son reales: 0.20 por sol
-- emparejado se cobra igual gane quien gane. Sí cambia si hay saldo fake de
-- por medio (0036), así que se recalcula y se reemplaza la fila.
--
-- SI EL QUE COBRÓ YA NO TIENE LA PLATA, la corrección se RECHAZA con el
-- nombre y el faltante. `admin_eliminar_evento_prueba` (0028) en ese caso
-- perdona la diferencia, pero eso es una herramienta de limpieza de datos
-- de prueba; acá se está moviendo plata real y comerse un descuadre en
-- silencio es peor que no poder corregir. Con `p_forzar = true` se toma lo
-- que haya y el faltante queda registrado en la auditoría.
-- =============================================================================

create table if not exists correcciones_resultado (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references perfiles (id),
  evento_id uuid not null references eventos (id) on delete cascade,
  resultado_anterior lado_apuesta not null,
  resultado_nuevo lado_apuesta not null,
  /** Cuánto se movió en total entre jugadores. */
  monto_movido numeric(12, 2) not null,
  /** Lo que no se pudo recuperar de quien ya se había gastado el premio. */
  faltante numeric(12, 2) not null default 0,
  motivo text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_correcciones_resultado_evento
  on correcciones_resultado (evento_id, created_at desc);

alter table correcciones_resultado enable row level security;

drop policy if exists correcciones_resultado_select_admin on correcciones_resultado;
create policy correcciones_resultado_select_admin
  on correcciones_resultado
  for select using (es_admin(auth.uid()));

create or replace function admin_corregir_resultado_pagado(
  p_admin_id uuid,
  p_evento_id uuid,
  p_resultado lado_apuesta,
  p_motivo text,
  p_forzar boolean default false
)
returns eventos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_apuesta record;
  v_perfil perfiles%rowtype;
  v_pago_antes numeric(12, 2);
  v_pago_ahora numeric(12, 2);
  v_delta numeric(12, 2);
  v_disponible numeric(12, 2);
  v_movido numeric(12, 2) := 0;
  v_faltante numeric(12, 2) := 0;
  v_puntos integer;
  v_resultado_real numeric(12, 2);
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede corregir un resultado' using errcode = 'P0290';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Indica por qué se corrige' using errcode = 'P0291';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0292';
  end if;
  if v_evento.estado <> 'resuelto' or v_evento.resultado is null then
    raise exception 'Esta partida no está pagada — usa declarar/corregir normal'
      using errcode = 'P0293';
  end if;
  if v_evento.resultado = p_resultado then
    raise exception 'Ese ya es el resultado registrado' using errcode = 'P0294';
  end if;

  -- --------------------------------------------------------------------
  -- Primera pasada: ¿alcanza la plata para revertir a todos los que
  -- cobraron de más? Se comprueba ANTES de mover nada, para no dejar la
  -- corrección a medias.
  -- --------------------------------------------------------------------
  if not p_forzar then
    for v_apuesta in
      select * from apuestas
      where evento_id = p_evento_id and monto_matcheado > 0 and lado = v_evento.resultado
    loop
      select * into v_perfil from perfiles where id = v_apuesta.usuario_id;
      v_pago_antes := round(v_apuesta.monto_matcheado * 1.80, 2);
      v_disponible := case when v_apuesta.es_fake
                           then v_perfil.saldo_fake
                           else v_perfil.saldo_disponible end;
      if v_disponible < v_pago_antes then
        raise exception
          '% cobró S/% y hoy solo tiene S/%. Ajusta su saldo primero o corrige con forzar.',
          v_perfil.nickname, v_pago_antes, v_disponible
          using errcode = 'P0295';
      end if;
    end loop;
  end if;

  -- --------------------------------------------------------------------
  -- Segunda pasada: aplicar la diferencia.
  -- --------------------------------------------------------------------
  for v_apuesta in
    select * from apuestas
    where evento_id = p_evento_id and monto_matcheado > 0
    for update
  loop
    v_pago_antes := case when v_apuesta.lado = v_evento.resultado
                         then round(v_apuesta.monto_matcheado * 1.80, 2) else 0 end;
    v_pago_ahora := case when v_apuesta.lado = p_resultado
                         then round(v_apuesta.monto_matcheado * 1.80, 2) else 0 end;
    v_delta := v_pago_ahora - v_pago_antes;

    -- Ganar da 3 puntos y perder 1 (0018); se ajusta la diferencia.
    v_puntos := (case when v_apuesta.lado = p_resultado then 3 else 1 end)
              - (case when v_apuesta.lado = v_evento.resultado then 3 else 1 end);

    if v_delta <> 0 or v_puntos <> 0 then
      select * into v_perfil from perfiles where id = v_apuesta.usuario_id for update;

      if v_apuesta.es_fake then
        -- Con forzar, no se baja de 0: el saldo fake tiene el mismo check.
        update perfiles
          set saldo_fake = greatest(0, saldo_fake + v_delta),
              puntos = greatest(0, puntos + v_puntos)
          where id = v_apuesta.usuario_id;
      else
        if v_delta < 0 and v_perfil.saldo_disponible < abs(v_delta) then
          v_faltante := v_faltante + (abs(v_delta) - v_perfil.saldo_disponible);
        end if;
        update perfiles
          set saldo_disponible = greatest(0, saldo_disponible + v_delta),
              puntos = greatest(0, puntos + v_puntos)
          where id = v_apuesta.usuario_id;
      end if;

      if v_delta > 0 then
        v_movido := v_movido + v_delta;
        insert into movimientos_saldo (usuario_id, tipo, monto, apuesta_id, evento_id, es_fake)
        values (v_apuesta.usuario_id, 'pago_ganancia', v_delta, v_apuesta.id, p_evento_id, v_apuesta.es_fake);
      end if;
    end if;
  end loop;

  -- --------------------------------------------------------------------
  -- La comisión se recalcula: con saldo fake de por medio el resultado
  -- real de la casa SÍ depende de quién ganó (ver 0036).
  -- --------------------------------------------------------------------
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

  delete from comisiones_plataforma where evento_id = p_evento_id;
  insert into comisiones_plataforma (evento_id, monto) values (p_evento_id, v_resultado_real);

  insert into correcciones_resultado
    (admin_id, evento_id, resultado_anterior, resultado_nuevo, monto_movido, faltante, motivo)
  values
    (p_admin_id, p_evento_id, v_evento.resultado, p_resultado, v_movido, v_faltante, trim(p_motivo));

  update eventos set resultado = p_resultado where id = p_evento_id
    returning * into v_evento;

  return v_evento;
end;
$$;

revoke all on function admin_corregir_resultado_pagado(uuid, uuid, lado_apuesta, text, boolean) from public;
grant execute on function admin_corregir_resultado_pagado(uuid, uuid, lado_apuesta, text, boolean) to service_role;
