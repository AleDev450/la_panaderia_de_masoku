-- =============================================================================
-- CACHUDOBET — Caballitos: la misma ronda, otra animación
-- 0058_ronda_modo_carrera.sql
--
-- LOS CABALLITOS NO NECESITAN UN MOTOR PROPIO. Miradas de cerca, una carrera y
-- la ruleta son el MISMO juego: se compran tickets con saldo, se arma un pozo,
-- se sortea un ticket y ese se lleva el premio. Lo único distinto es si el
-- resultado se muestra con una rueda girando o con caballos corriendo.
--
-- Por eso acá no hay tabla nueva: se agrega una columna `modo` a las rondas
-- que ya existen. Con eso los caballitos heredan gratis y sin copiar una sola
-- línea:
--
--   · la compra de tickets con saldo y sus validaciones (0048),
--   · el pozo, el premio y la comisión —incluida la regla de 0051 de cobrar
--     solo sobre lo ajeno, para que nadie pierda ganando—,
--   · el sorteo uniforme sobre las filas de `ruleta_tickets`,
--   · el anclaje de la animación contra el reloj del servidor.
--
-- Y algo que cae de regalo: `ruleta_tickets` ya guarda UNA FILA POR TICKET, que
-- es exactamente un caballo. `ganador_ticket_id` ya apunta al caballo ganador
-- sin traducción de por medio.
--
-- Duplicar todo esto en tablas aparte habría significado mantener dos veces la
-- misma matemática de dinero — y que un arreglo en una se olvidara en la otra.
--
-- LA SEMILLA de la carrera no necesita columna: se deriva de
-- `id || girada_at`. Conocerla no sirve para predecir nada, porque el ganador
-- se elige recién al girar; lo único que decide es la coreografía.
-- =============================================================================

alter table ruleta_rondas
  add column if not exists modo text not null default 'ruleta';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'modo_conocido') then
    alter table ruleta_rondas
      add constraint modo_conocido check (modo in ('ruleta', 'carrera'));
  end if;
end;
$$;

comment on column ruleta_rondas.modo is
  'Cómo se muestra el sorteo de esta ronda (0058): `ruleta` gira una rueda, `carrera` corre los caballitos. La mecánica y el dinero son idénticos.';

-- Las rondas que ya existen son de ruleta — el default las cubre, y esto lo
-- deja explícito para el que lea la tabla.
update ruleta_rondas set modo = 'ruleta' where modo is null;

-- ---------------------------------------------------------------------------
-- admin_guardar_ronda: ahora recibe el modo.
--
-- Cambia la firma, así que se DROPea la de 0048 antes de recrear: un
-- `create or replace` con otra lista de argumentos deja las DOS funciones
-- vivas, y el panel podría terminar llamando a la vieja sin enterarse.
-- ---------------------------------------------------------------------------

drop function if exists admin_guardar_ronda(uuid, uuid, text, text);

create or replace function admin_guardar_ronda(
  p_admin_id uuid,
  p_ronda_id uuid,
  p_nombre text,
  p_premio_concepto text,
  p_modo text default 'ruleta'
)
returns ruleta_rondas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config cachudobet_config%rowtype;
  v_ronda ruleta_rondas%rowtype;
  v_modo text;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede crear rondas' using errcode = 'P0310';
  end if;
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'Ponle un nombre a la ronda' using errcode = 'P0311';
  end if;

  v_modo := coalesce(nullif(trim(coalesce(p_modo, '')), ''), 'ruleta');
  if v_modo not in ('ruleta', 'carrera') then
    raise exception 'Modo de ronda desconocido' using errcode = 'P0314';
  end if;

  if p_ronda_id is null then
    select * into v_config from cachudobet_config where id;

    insert into ruleta_rondas (
      admin_id, nombre, premio_concepto,
      precio_ticket, porcentaje_premio, porcentaje_casa, modo
    )
    values (
      p_admin_id,
      trim(p_nombre),
      nullif(trim(coalesce(p_premio_concepto, '')), ''),
      v_config.precio_ticket,
      v_config.porcentaje_premio,
      v_config.porcentaje_casa,
      v_modo
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
          premio_concepto = nullif(trim(coalesce(p_premio_concepto, '')), ''),
          modo = v_modo
      where id = p_ronda_id
      returning * into v_ronda;
  end if;

  return v_ronda;
end;
$$;

revoke all on function admin_guardar_ronda(uuid, uuid, text, text, text) from public;
grant execute on function admin_guardar_ronda(uuid, uuid, text, text, text) to service_role;
