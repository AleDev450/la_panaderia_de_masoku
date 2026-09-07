-- =============================================================================
-- CACHUDOBET — La carrera de caballitos del sorteo
-- 0056_carrera_sorteo.sql
--
-- UN CABALLO POR TICKET. Quien tiene 4 tickets corre con 4 caballos
-- (`Fulano_01` … `Fulano_04`), y cada caballo de la pista vale exactamente lo
-- mismo que cualquier otro. Así la ventaja del que compró más NO está
-- escondida en una probabilidad invisible: se ve, son más caballos.
--
-- Esto es lo que arregla el problema de fondo de una carrera. En la ruleta el
-- peso se ve solo (el arco es más grande); con un caballo por persona, uno de
-- 1 ticket y uno de 4 se verían idénticos y el juego parecería un dibujo
-- animado aunque por dentro fuera justo.
--
-- LA CARRERA ES TEATRO, NO EL SORTEO. El ganador se elige acá, en Postgres,
-- antes de que se mueva un pixel — igual que el giro de la ruleta (0048) y la
-- moneda (0053). El navegador solo anima hacia un resultado ya escrito.
--
-- POR QUÉ SIGUE SIENDO JUSTO elegir primero la persona (ponderado por sus
-- tickets) y después cuál de SUS caballos cruza primero:
--
--   P(un caballo concreto) = P(su dueño gane) × 1/(sus tickets)
--                          = (tickets/total) × (1/tickets)
--                          = 1/total
--
-- O sea: exactamente lo mismo que sortear uniforme entre los 32 caballos,
-- pero reusando el sorteo ponderado que ya existe y está probado (0038).
--
-- LA SEMILLA es lo que hace que todos vean LA MISMA carrera. Cada caballo saca
-- su perfil de velocidad de `hash(semilla + su id)`, así que los
-- adelantamientos y el final de foto son idénticos en todas las pantallas —
-- y aun así impredecibles hasta que corren.
--
-- Una fila por carrera y no columnas en `sorteos` porque el sorteo admite
-- VARIOS ganadores (varios cofres): cada carrera queda con su historial.
-- =============================================================================

create table if not exists carreras_sorteo (
  id uuid primary key default gen_random_uuid(),
  sorteo_id uuid not null references sorteos (id) on delete cascade,
  inscripcion_ganadora_id uuid not null references inscripciones_sorteo (id) on delete cascade,
  /** Cuál de los caballos de esa persona cruzó primero: 1..sus tickets. */
  caballo_numero integer not null check (caballo_numero >= 1),
  /** De acá sale el perfil de velocidad de cada caballo. */
  semilla text not null,
  /** Marca del reloj del SERVIDOR en que se abre la puerta de partida. */
  inicia_en timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_carreras_sorteo
  on carreras_sorteo (sorteo_id, created_at desc);

alter table carreras_sorteo enable row level security;

-- La carrera es el espectáculo: cualquiera logueado la ve.
drop policy if exists carreras_select on carreras_sorteo;
create policy carreras_select
  on carreras_sorteo
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- admin_correr_carrera: EL botón de largada.
--
-- Elige, marca y escribe TODO antes de fijar `inicia_en`. Para cuando la
-- primera pantalla se entera de que hay carrera, el ganador ya está guardado.
--
-- Elegir y marcar en una sola sentencia (igual que 0038): si fueran dos, dos
-- clics simultáneos podrían sacar a la misma persona dos veces.
-- ---------------------------------------------------------------------------

create or replace function admin_correr_carrera(
  p_admin_id uuid,
  p_sorteo_id uuid
)
returns carreras_sorteo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inscripcion inscripciones_sorteo%rowtype;
  v_carrera carreras_sorteo%rowtype;
  v_caballo integer;
begin
  if not es_admin(p_admin_id) then
    raise exception 'Solo un administrador puede largar la carrera' using errcode = 'P0440';
  end if;

  if not exists (select 1 from sorteos where id = p_sorteo_id) then
    raise exception 'Sorteo no encontrado' using errcode = 'P0441';
  end if;

  -- Ponderado por tickets (Efraimidis–Spirakis, ver 0038): `random()^(1/n)`
  -- da probabilidad exactamente proporcional en una sola pasada.
  update inscripciones_sorteo
    set ganador = true
    where id = (
      select id
      from inscripciones_sorteo
      where sorteo_id = p_sorteo_id
        and not ganador
        and tickets > 0
      order by power(random(), 1.0 / tickets::float8) desc
      limit 1
    )
    returning * into v_inscripcion;

  if not found then
    raise exception 'No queda nadie con tickets para correr' using errcode = 'P0442';
  end if;

  -- Cuál de SUS caballos cruza primero. Uniforme entre los suyos: con la
  -- ponderación de arriba, esto da 1/total por caballo (ver cabecera).
  v_caballo := 1 + floor(random() * v_inscripcion.tickets)::integer;

  insert into carreras_sorteo (
    sorteo_id, inscripcion_ganadora_id, caballo_numero, semilla, inicia_en
  )
  values (
    p_sorteo_id,
    v_inscripcion.id,
    v_caballo,
    gen_random_uuid()::text,
    -- 5s: alcanza para la presentación de los caballos y para que el poll de
    -- los clientes llegue a tiempo a la largada.
    now() + interval '5 seconds'
  )
  returning * into v_carrera;

  return v_carrera;
end;
$$;

revoke all on function admin_correr_carrera(uuid, uuid) from public;
grant execute on function admin_correr_carrera(uuid, uuid) to service_role;
