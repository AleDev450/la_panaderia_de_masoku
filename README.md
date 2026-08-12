# LA PANADERÍA DE MASOKU

Aplicación web responsive de apuestas **1 contra 1** entre jugadores, con
estética de fantasía medieval / MOBA original. Mascota oficial: el
"Guardián de la masa", un panadero de batalla (`public/images/mascota.png`).

La pantalla de registro/ingreso (`src/app/page.tsx`) está construida sobre
las ilustraciones reales de la marca (fondo de la plaza, placa del logo,
cartel de reglas, y los paneles de "Crear cuenta"/"Ingresar") en vez de
recrearlas en CSS — ver la sección "Pantalla de registro con arte real"
más abajo si vas a tocar esos formularios.

> Proyecto de demostración. No procesa pagos, depósitos, retiros ni
> criptomonedas reales. Acceso restringido a mayores de 18 años —
> juego responsable.

## Tecnologías

- Next.js (App Router) + React + TypeScript
- Tailwind CSS v4
- Framer Motion (animaciones de la mascota, toasts, modal)
- Supabase Auth (registro/login de jugadores y de `/bakery`, ambos reales —
  ver "Cuentas de jugador y de staff" más abajo) + Postgres (Zod + RPC en
  PL/pgSQL) para el motor de emparejamiento real
- **Todo el flujo de apuestas corre sobre ese motor real.** El demo 1:1
  mock en `localStorage` (`betService.ts`, `MatchesContext`, `data/matches`)
  fue retirado por completo; `/partidas`, `/mis-apuestas` e `/historial`
  leen Postgres. Emparejamiento FIFO parcial multi-jugador, cuota fija
  1.80x, y devolución automática de lo no emparejado al liquidar.
- Las recargas (`/recargar`) también viven en Postgres (tabla `recargas`,
  migración `0009`): comprobante manual + aprobación admin, en montos de
  S/10 en 10 hasta S/100. **Ya no queda nada en `localStorage`.**

## Instalación y ejecución

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Otros scripts:

```bash
npm run build   # build de producción
npm run start   # sirve el build de producción
npm run lint    # eslint
npm run test    # pruebas de la lógica de emparejamiento (vitest)
```

## Estructura del proyecto

```
src/
  app/                  Rutas (App Router)
    page.tsx            Pantalla 1: registro / ingreso
    partidas/            Pantalla 2: partidas del día
    mis-apuestas/         Retos propios y duelos emparejados
    historial/            Historial de duelos del usuario
    ranking/               Ranking de puntos / niveles
    recargar/               Subir comprobante de recarga
    como-jugar/            Reglas del formato 1:1
    bakery/                 Panel admin (RequireAdmin) — ruta a propósito no
                            obvia, ver "Panel de administración" más abajo
      titulos/               Crear títulos, editar contador, declarar resultado
      recargas/               Aprobar / rechazar comprobantes
  components/            Componentes reutilizables (Header, MatchCard,
                         BetModal, Mascot, Logo, TeamCrest, CountdownBadge,
                         LevelBadge, RequireAuth, RequireAdmin, formularios…)
  context/               Estado global (React Context): sesión, partidas,
                         recargas, notificaciones
  data/                  Datos simulados (equipos, partidas del día, niveles)
  lib/
    image.ts              Compresión de comprobantes a data URL en el cliente
  services/               Lógica de negocio pura y funciones "API"
    betService.ts        crear reto, validar monto, emparejar, cierre por
                          contador, resolver título y repartir puntos
    userService.ts        registro / ingreso / ranking — Supabase Auth +
                          tabla `perfiles` real (ver "Cuentas de jugador y de staff")
    apiClient.ts          wrapper fetch listo para una API REST real
  actions/
    recargas.ts            Server Actions de recarga (crear, listar, resolver)
    perfiles.ts            Server Actions admin: acreditar saldo,
                          otorgar puntos (resolución de títulos) — RPC
                          admin_creditar_saldo / admin_otorgar_puntos
    betting.ts              Server Actions del motor de apuestas (/partidas)
  types/                  Tipos TypeScript compartidos
```

## Regla de negocio 1:1

Toda la lógica de emparejamiento vive en `src/services/betService.ts`,
como funciones puras e independientes, fáciles de testear:

- `validateAmount` — el monto debe ser un entero entre S/10 y S/100.
- `getOppositeSide` — GANA ⇄ PIERDE.
- `isOwnChallenge` — evita que el creador acepte su propio reto.
- `createChallenge` — publica un reto (lado + monto) en una partida sin
  duelo activo.
- `acceptChallenge` / `pairBets` — el segundo jugador solo puede tomar el
  lado contrario, por el mismo monto exacto; nunca se permite que dos
  apuestas queden del mismo lado.
- `getUserBets` — retos propios y duelos emparejados de un usuario.

Estas funciones están cubiertas por pruebas en
`src/services/betService.test.ts` (`npm run test`).

Una apuesta, una vez registrada (publicada o tomada), **no se puede
retirar** — no existe ninguna acción de cancelación en la UI del demo 1:1.

## Pantalla de registro con arte real

`/` (registro/ingreso) no usa paneles de CSS genéricos: usa las
ilustraciones reales de la marca como fondo/skin, con inputs de verdad
posicionados encima en porcentaje.

- `public/images/plaza-background.png` — fondo de la pantalla completa.
- `public/images/titulo.png` — placa del logo (`Logo` con `asImage`).
- `public/images/reglas.png` — cartel de reglas; el texto ya viene
  dibujado, así que `GameRulesSidebar` lo pinta como imagen decorativa y
  duplica el contenido en un bloque `sr-only` para lectores de pantalla.
- `public/images/crear-cuenta.png` / `ingresar-cuenta.png` — los paneles
  de formulario, con las cajas de texto, checkbox y botón ya dibujados.

Para estos dos últimos, `ArtPanel` (`src/components/auth/ArtPanel.tsx`)
envuelve la imagen en un contenedor con `aspect-ratio` fijo (el mismo
ancho/alto del PNG), y `ArtInput` (`src/components/auth/ArtInput.tsx`)
posiciona inputs reales en **porcentaje** sobre las cajas ya dibujadas —
como el contenedor mantiene el aspect-ratio del arte en cualquier tamaño
de pantalla, esos porcentajes se mantienen alineados sin importar el
viewport. Las coordenadas de cada campo se extrajeron una sola vez con un
script (`sharp`) que detecta los rectángulos oscuros de cada casilla en
el PNG — si cambias esas imágenes, hay que volver a medir.

Cada `ArtInput` tiene fondo opaco (~`#0e0a06`, el mismo tono que el
relleno de la casilla dibujada) para tapar por completo cualquier texto
de ejemplo horneado en el arte (p.ej. "PanConQueso"); si un botón o link
propio se superpone a un texto ya dibujado en la imagen (como
"¿Olvidaste tu contraseña?" en `ingresar-cuenta.png`), también necesita
fondo opaco — de lo contrario ambos textos se ven doblados/borrosos.

> Nota: `imgs_reference/mascota.png`, `reglas.png`, `crear_cuenta.png` e
> `ingresar_cuenta.png` llegaron con un patrón de cuadros (checkerboard)
> horneado como píxeles reales (sin canal alfa) en vez de transparencia
> de verdad — se procesaron con un flood-fill desde los bordes
> (`sharp`, no un simple umbral de color, para no perder blancos reales
> del arte como el gorro del panadero) antes de copiarlos a
> `public/images/`.

## Panel de administración, títulos, recargas y niveles

Todo el panel corre sobre Postgres — cuentas, apuestas, recargas y
solicitudes de cambio de teléfono:

### Cuentas de jugador y de staff — ambas Supabase Auth real

El registro/login de `/` (jugadores) y el login de `/bakery` (staff) usan
el **mismo backend real**: Supabase Auth + la tabla `perfiles` (la misma
que usa el motor de apuestas). No hay dos sistemas de cuentas separados —
lo único que distingue a un jugador de un admin es `perfiles.rol`.

- **Registro de jugador** (`RegisterForm` → `registerUser` en
  `src/services/userService.ts` → `registerPlayer` en
  `src/actions/auth.ts`): la cuenta se crea con el cliente admin
  (`service_role`) vía `auth.admin.createUser({ ..., email_confirm: true
  })` en vez de `supabase.auth.signUp` desde el navegador — así el
  registro nunca depende de que el usuario confirme por correo ni del
  toggle "Confirm email" del dashboard, queda listo para iniciar sesión
  de inmediato. El correo es único a nivel de `auth.users`, así que
  `registerPlayer` ya rechaza duplicados. El trigger `handle_new_user`
  (`0004`/`0005`) crea la fila en `perfiles` en el mismo insert, con
  `rol = 'user'` siempre — nunca depende de "quién se registró primero"
  (ver más abajo por qué).
- **Login** (`LoginForm` y `BakeryLoginForm`, ambos llaman al mismo
  `login` del `SessionContext`): `supabase.auth.signInWithPassword({
  email, password })`, luego lee `perfiles` para el rol/saldo/puntos.
- El arte de `crear-cuenta.png` / `iniciar-sesion.png` no trae una caja
  dibujada para correo (solo nombre/teléfono/nickname/contraseña) —
  el campo de correo va aparte, con estilo genérico, encima del panel de
  arte en ambos formularios.

**Para tener un admin:** crea el usuario normalmente (por `/` o desde
**Authentication → Users** del dashboard) y después promuévelo a mano:

```sql
update perfiles set rol = 'admin' where id = '<uuid-del-usuario>';
```

(ver también el `update` comentado en `supabase/migrations/0003_seed.sql`).
La migración `0004_handle_new_user.sql` original marcaba admin al primer
usuario que existiera en `perfiles`; `0005_perfiles_players.sql` quitó esa
regla — con el registro abierto a jugadores reales, "el primero en
llegar" es un vector de privilegio, no una regla de negocio.

> El panel admin vive en `/bakery` a propósito, no en `/admin` — esa ruta
> es de las primeras que prueba cualquier scanner automatizado. Esto no
> reemplaza el control de acceso real (`RequireAdmin` sigue exigiendo
> sesión + `rol === 'admin'`), es solo una capa extra de "no lo hagas
> tan fácil de encontrar" (security through obscurity, nunca la única
> defensa).

### Títulos de apuesta (`/bakery/titulos`)

Antes, las 3 partidas del día eran datos fijos en `src/data/matches.ts`.
Ahora un admin puede publicar nuevos **títulos de apuesta** (pregunta +
lado A + lado B + hora) desde `/bakery/titulos`; aparecen de inmediato en
`/partidas` para que los usuarios elijan sobre cuál apostar —
`MatchesContext.createTitulo()`.

Cada título tiene un **contador de cierre** (`duracionMin`, 10 minutos
por defecto, editable por título en el mismo panel admin). Mientras el
contador corre, el título acepta retos y aceptaciones normalmente
(`isMatchOpen` en `betService.ts`); al vencer, `createChallenge` /
`acceptChallenge` rechazan cualquier intento nuevo y la tarjeta muestra
"Título cerrado". `CountdownBadge` pinta la cuenta regresiva en vivo
tanto en `/partidas` como en `/bakery/titulos`.

Cuando el admin declara el resultado (**Declarar GANA** / **Declarar
PIERDE**), `resolveMatch` reparte puntos al duelo emparejado de ese
título (ver niveles abajo) y el título queda `resuelto` — ya no acepta
más acciones.

### Recargas con comprobante (`/recargar` y `/bakery/recargas`)

El jugador elige cuánto depositó (de S/10 en 10 hasta S/100) y sube una
foto del comprobante. La imagen se comprime en el navegador
(`src/lib/image.ts`, 1000px → JPEG) y se guarda como `data:` URL en la
columna `recargas.comprobante`. La recarga queda `pendiente`.

Desde `/bakery/recargas`, el admin:

- Ve **nickname, nombre completo y teléfono** del jugador — el teléfono
  es el dato con el que se confirma de quién vino el depósito.
- **Amplía el comprobante** a pantalla completa (con zoom) para leer la
  hora y el monto impresos.
- **Corrige el monto si hace falta** antes de aprobar: el jugador pudo
  declarar S/100 y el comprobante decir S/50. Se guardan por separado
  `monto_solicitado` (lo declarado) y `monto_acreditado` (lo que
  realmente se abonó), así queda registro de la discrepancia.

Aprobar acredita el saldo y cierra la recarga **en una sola transacción**
(RPC `admin_resolver_recarga`) — antes eran dos pasos sueltos y, si el
segundo fallaba, la recarga quedaba aprobada sin dinero acreditado. Nunca
se acredita saldo sin comprobante.

> ⚠️ El comprobante se guarda como texto en Postgres. Para producción lo
> correcto sería Supabase Storage (bucket + policies + signed URLs); acá
> se prefirió texto para no agregar esa superficie a un demo.

### Niveles y ranking (`/ranking`)

Cada usuario tiene un contador de `puntos` (columna `perfiles.puntos`),
que **`resolver_evento` reparte en la misma transacción que el dinero**
(ver `0007_resolver_evento_puntos.sql`), por cada apuesta que llegó a
emparejar algo:

- El lado que acertó el resultado: **+5 puntos**.
- El lado que no: **+1 punto** (participar en un evento resuelto siempre
  puntúa, nunca 0).
- Una orden que nunca encontró contraparte se devuelve entera y no
  puntúa — no hubo participación real.

Los niveles son bandas de 10 puntos con nombres temáticos de panadería
(`src/data/levels.ts`: Masa → Fermento → Horneado → … → Guardián de la
Masa) y `LevelBadge` los pinta con las imágenes de
`public/images/levels/nivel-N.png`. `/ranking` lista a todos los usuarios
ordenados por puntos — "los panaderos más gosus". Esas mismas insignias
son las que se usan como escudo de cada retador en `/partidas`
(`src/components/partidas/RetadorBadge.tsx`); si un lado no tiene
retador todavía, se pinta un escudo neutro con "?" y "Esperando retador".

### Perfil del jugador (`/perfil`)

El panadero edita su propia cuenta desde `/perfil` (accesible desde el
bloque de identidad a la izquierda del header):

- **Nickname** — único. El unique index de `perfiles.nickname` lo
  garantiza y el RPC `actualizar_nickname` además compara sin distinguir
  mayúsculas, traduciendo el choque a un mensaje entendible.
- **Correo** — se cambia en Supabase Auth (no en `perfiles`, que no lo
  guarda) con `email_confirm: true`, igual que el registro: efectivo de
  inmediato, sin pedir confirmación por correo.
- **Teléfono** — **no** se edita directamente. El jugador manda una
  solicitud y un admin la aprueba desde `/bakery/telefonos`; recién ahí
  se escribe en `perfiles.phone`. Se trata distinto a propósito: es el
  dato con el que el equipo identifica los depósitos de una recarga, así
  que dejarlo editable abriría la puerta a reclamar depósitos ajenos. Un
  unique index parcial limita a una solicitud pendiente por usuario.

## Conectar una API REST (Laravel u otra)

El proyecto está preparado para reemplazar los datos simulados sin tocar
la UI. Las cuentas (`userService.ts`) ya no son parte de esto — corren
sobre Supabase Auth real, ver "Cuentas de jugador y de staff" arriba.
Sigue simulado, por ahora, todo lo demás del demo 1:1:

1. Define `NEXT_PUBLIC_API_BASE_URL` en `.env.local` apuntando a tu API.
2. En `src/context/MatchesContext.tsx`, sustituye el estado inicial
   (`initialMatches` desde `src/data/matches.ts`) por un `fetch` a
   `GET /matches`, y haz que `publishChallenge` / `takeChallenge` llamen a
   `POST /matches/:id/challenges` y `POST /challenges/:id/accept` en lugar
   de mutar el estado local directamente. Reemplaza `apiRequest`
   (`src/services/apiClient.ts`) por tus endpoints.
3. Los tipos en `src/types/index.ts` (`Match`, `Team`, `Bet`, `BetSide`,
   `PendingChallenge`, `PairedBet`) están pensados para coincidir 1:1 con
   el payload JSON que devolvería la API — reutilízalos como contrato.

La lógica de validación (`betService.ts`) puede mantenerse en el
frontend como validación optimista, mientras el backend aplica la misma
regla como fuente de verdad.

## Motor de emparejamiento real (Supabase/Postgres) — `/partidas`

Un **motor de apuestas peer-to-peer con cuota fija 1.80**, con el matching
y la liquidación resueltos enteramente en Postgres (no en el cliente ni en
JS del servidor).

El flujo completo:

1. Un **admin** publica un título desde `/bakery/titulos`: nombre, lado A,
   lado B, categoría (dota2 / csgo / lol / valorant / otros) y minutos
   hasta el cierre. `/partidas` solo lista los títulos de hoy.
2. Un **jugador abre sala**: elige uno de esos títulos, su lado y su monto
   (S/10–S/100). Esa primera apuesta convierte el título en una sala
   visible en la grilla.
3. **Otros jugadores la cubren por partes.** `crear_apuesta` empareja FIFO
   contra el lado contrario, parcialmente si hace falta: varias personas
   pueden cubrir a una sola, con montos distintos. Nadie se empareja
   consigo mismo. Al vencer el contador no entran apuestas nuevas.
4. El **admin declara el resultado** con `resolver_evento`, que en una sola
   transacción paga 1.80x sobre lo emparejado ganador, devuelve lo que
   nunca se cubrió, registra la comisión de plataforma y reparte los
   puntos de progresión.

Piezas: `getEventosHoy` / `crearEvento` en `src/actions/betting.ts`, la UI
en `src/components/partidas/`, y `/mis-apuestas` + `/historial` para el
seguimiento del jugador.

> Antes existía `/exchange/[eventoId]`, una pantalla de ejemplo sobre este
> mismo motor con un order book agregado anónimo. Quedó duplicada por
> `/partidas` (y sin ningún enlace que llevara a ella), así que se retiró
> junto con `getOrderBook`/`getEvento`/`getMisApuestas`. Está en el
> historial de git si necesitas recuperarla.

### Configuración

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → ejecuta en orden:
   - `supabase/migrations/0001_schema.sql` (tablas, enums, índices, RLS)
   - `supabase/migrations/0002_functions.sql` (RPC: `crear_apuesta`,
     `cancelar_apuesta`, `resolver_evento`)
   - opcional: `supabase/migrations/0003_seed.sql` (comentado, contiene
     ejemplos para crear un evento de prueba y dar saldo demo)
   - `supabase/migrations/0004_handle_new_user.sql` (trigger
     `handle_new_user`: crea la fila en `perfiles` al registrarse en
     Auth — su versión original quedó reemplazada por `0005`)
   - `supabase/migrations/0005_perfiles_players.sql` (columnas
     `full_name`/`phone`/`puntos`, corrige `handle_new_user` para que todo
     signup nuevo entre como `rol = 'user'`, ajusta RLS de `perfiles`, y
     agrega los RPC `admin_creditar_saldo` / `admin_otorgar_puntos` — ver
     "Cuentas de jugador y de staff" arriba)
   - `supabase/migrations/0006_eventos_categoria_cierre.sql` (columnas
     `eventos.categoria` / `eventos.cierra_en`; `crear_apuesta` ahora
     rechaza apuestas después de `cierra_en` y fuera del rango S/10–S/100
     — necesaria para que `/partidas` funcione)
   - `supabase/migrations/0007_resolver_evento_puntos.sql`
     (`resolver_evento` además reparte los puntos de progresión: +5 al
     lado que acertó, +1 al que no, dentro de la misma transacción que la
     liquidación del dinero)
   - `supabase/migrations/0008_solicitudes_telefono.sql` (tabla
     `solicitudes_telefono` + RLS, RPC `admin_resolver_solicitud_telefono`
     y `actualizar_nickname` — ver "Perfil del jugador" abajo)
   - `supabase/migrations/0009_recargas.sql` (tabla `recargas` + RLS y RPC
     `admin_resolver_recarga`, que acredita el saldo y cierra la recarga
     en una sola transacción — antes vivían en `localStorage`)
3. Copia `.env.example` → `.env.local` y completa `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (esta
   última es secreta, solo se usa en el servidor — nunca la expongas al
   cliente).
4. Regístrate desde `/` o crea un usuario en **Authentication → Users**
   — su fila en `perfiles` se crea sola vía trigger. Promueve a admin con
   el `update` comentado en `0003_seed.sql` si necesitas entrar a `/bakery`
   o probar `resolver_evento`.
5. Publica un título desde `/bakery/titulos` y ábrelo en `/partidas`. Para
   validar el motor de punta a punta, sigue
   [`docs/checklist-motor.md`](docs/checklist-motor.md).

### Piezas

```
supabase/migrations/
  0001_schema.sql              Enums, tablas, índices, RLS
  0002_functions.sql           crear_apuesta / cancelar_apuesta / resolver_evento
  0003_seed.sql                 Ejemplos comentados para desarrollo local
  0004_handle_new_user.sql       Trigger que crea la fila en perfiles al registrarse
  0005_perfiles_players.sql       Columnas de jugador, RLS, admin_creditar_saldo/admin_otorgar_puntos
  0006_eventos_categoria_cierre.sql  categoria + cierra_en + límites S/10–100
  0007_resolver_evento_puntos.sql     resolver_evento reparte puntos de progresión
  0008_solicitudes_telefono.sql        Cola de cambio de teléfono + actualizar_nickname
src/lib/supabase/
  server.ts            Cliente ligado a la sesión del usuario (RLS activo)
  admin.ts              Cliente service_role — SOLO server actions, nunca cliente
  types.ts               Tipos TS espejo del esquema SQL
src/lib/apuestas.ts             Cuota, pago redondeado y liquidación (solo UI, no mueve saldo)
src/lib/validation/betting.ts   Esquemas Zod (rango S/10–100, 2 decimales)
src/actions/betting.ts           Server actions: crearApuesta, cancelarApuesta,
                                  crearEvento, resolverEvento, getEventosHoy,
                                  getMisApuestasConEvento
src/actions/perfil.ts            Nickname / correo / cola de cambio de teléfono
src/components/partidas/         PartidaCard, LadoPanel, CrearSalaModal, RetadorBadge
src/app/partidas/                 Pantalla principal del motor
```

### Reglas de negocio implementadas

- **Retención de saldo**: `crear_apuesta` mueve `monto` de
  `saldo_disponible` a `saldo_retenido` de forma atómica junto con el
  insert de la apuesta; rechaza si no hay fondos.
- **Matching FIFO con `FOR UPDATE SKIP LOCKED`**: dentro de la misma
  transacción de `crear_apuesta`, se recorren las órdenes pendientes/parciales
  del lado contrario ordenadas por `created_at`, bloqueando cada fila
  candidata para que ninguna otra transacción concurrente pueda tomarla —
  así se evita el doble-emparejamiento del mismo dinero.
- **Órdenes parciales**: cada emparejamiento actualiza `monto_matcheado` /
  `monto_pendiente` y el `estado` (`pendiente` → `parcial` → `completa`)
  tanto de la orden entrante como de cada contraparte tocada.
- **Cancelación parcial**: `cancelar_apuesta` solo libera el
  `monto_pendiente` (nunca lo ya emparejado) mientras el evento siga
  `abierto`.
- **Liquidación**: `resolver_evento` (solo admin) devuelve todo lo no
  emparejado, paga `monto_matcheado × 1.80` a los ganadores, libera el
  retenido de ganadores y perdedores, y registra en
  `comisiones_plataforma` el `0.20 × monto` de cada emparejamiento — la
  ganancia de la plataforma, garantizada e independiente del resultado.
- **Auto-matching bloqueado**: `crear_apuesta` excluye explícitamente
  órdenes del propio `usuario_id` al buscar contraparte.
- **Auditoría completa**: cada movimiento de saldo (`retencion`,
  `devolucion`, `pago_ganancia`, `cancelacion`) queda registrado en
  `movimientos_saldo`; cada match, en `emparejamientos`.

### Por qué las RPC solo aceptan `service_role`

`crear_apuesta`, `cancelar_apuesta` y `resolver_evento` reciben el id del
usuario/admin actuante como **parámetro explícito** (igual patrón que ya
usa `SECURITY DEFINER`), en vez de leerlo de `auth.uid()`. Por eso su
`GRANT EXECUTE` está restringido a `service_role`: si un cliente con la
`anon key` pudiera llamarlas directo, podría pasar el `usuario_id` de
otra persona. El servidor Next.js (`src/actions/betting.ts`) resuelve el
id real desde la cookie de sesión del usuario **antes** de invocar la
función, así que la confianza en el parámetro está justificada solo ahí.

## Correr todo en Docker (Supabase local → luego tu proyecto en la nube)

Flujo recomendado: primero todo **local** con Docker (app + Supabase
self-hosted vía el CLI), verificas que funciona, y luego apuntas las
mismas migraciones/app a tu proyecto de Supabase en la nube sin tocar
código.

### 1. Supabase local (usa Docker por debajo)

El CLI de Supabase orquesta su propio `docker compose` (Postgres, Auth,
PostgREST, Studio, Realtime, Storage…) — no lo escribas a mano, son ~13
contenedores interdependientes:

```bash
npx supabase init      # ya hecho en este repo (supabase/config.toml)
npx supabase start     # descarga imágenes la primera vez, tarda varios minutos
```

Al terminar imprime `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, etc. — y
aplica automáticamente todo `supabase/migrations/*.sql`, en orden.
Guárdalos:

```bash
npx supabase status    # para volver a verlos después
```

> Si ya tienes **otro** proyecto con Supabase local corriendo, sus
> puertos por defecto (54321-54327) van a chocar. Este repo ya usa un
> rango libre (54421-54427, ver `supabase/config.toml`) para poder
> correr varios proyectos Supabase locales a la vez.

### 2. La app en su propio contenedor, contra ese Supabase local

```bash
cp .env.docker.example .env.docker
# completa NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY
# con los valores que imprimió `supabase start`
docker compose --env-file .env.docker up --build -d
```

Abre [http://localhost:3100](http://localhost:3100) (el `docker-compose.yml`
mapea `3100 → 3000` porque el 3000 del host puede estar ocupado por otro
proyecto — cámbialo si hace falta).

El contenedor de la app se une a la red `supabase_network_la-panaderia`
que crea el CLI, y le habla al gateway Kong por su nombre de contenedor
(`supabase_kong_la-panaderia:8000`), no por `localhost` — desde dentro
de un contenedor, `localhost` es el contenedor mismo, no el host. Ningún
componente de este proyecto llama a Supabase desde el navegador (todo
pasa por Server Actions/Server Components), así que esto es seguro pese
a usar el prefijo `NEXT_PUBLIC_`.

Para desarrollo normal (`npm run dev`, sin Docker para la app) usa en
cambio `.env.local` con `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421`
(el puerto publicado en el host).

### 3. Checklist para verificar que todo funciona de verdad

No te quedes en "compiló". El emparejamiento parcial, la cuota, la
devolución y los puntos viven en PL/pgSQL, donde ningún test de
TypeScript llega — la única forma de validarlos es ejercitarlos.

**El checklist completo, paso a paso, está en
[`docs/checklist-motor.md`](docs/checklist-motor.md)**: verificar que las
migraciones se aplicaron, abrir una sala, comprobar que varias personas
cubren a una sola por partes, las reglas que deben rechazar, y que al
resolver el dinero cuadra exacto (pozo = pago 1.80x + comisión).

Además, para el entorno Docker:

```bash
# a) La app responde
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/

# b) La app SÍ llega a Supabase por la red interna de Docker (no solo
#    que el contenedor arrancó)
docker exec la-panaderia-app-1 sh -c \
  "wget -qO- http://supabase_kong_la-panaderia:8000/rest/v1/ --header='apikey: TU_ANON_KEY' | head -c 200"

# c) Las migraciones aplicaron sin errores (lee la salida de `supabase
#    start` / `supabase db reset` — cualquier ERROR ahí es un bug real
#    en el SQL, no algo que los tests de TypeScript puedan detectar)
```

`npx supabase db reset` vuelve a aplicar las migraciones desde cero
sobre una base limpia — es la forma más rápida de repetir este checklist
después de cambiar el SQL.

> Nosotros ya corrimos este checklist al armar el proyecto y encontramos
> un bug real (un `CASE` dentro de un `UPDATE` no casteaba al enum
> `estado_apuesta`, cosa que ningún test de TypeScript puede detectar
> porque vive solo en el SQL) — quedó corregido en
> `supabase/migrations/0002_functions.sql`. Repite el checklist si tocas
> ese archivo.

### 4. Pasar de local a tu proyecto en la nube

1. Crea el proyecto en [supabase.com](https://supabase.com).
2. `npx supabase link --project-ref TU_PROJECT_REF` (una vez).
3. `npx supabase db push` sube las migraciones de `supabase/migrations/`
   tal cual las probaste en local — mismo SQL, sin reescribir nada.
4. En `.env.docker` (o `.env.local`) cambia `NEXT_PUBLIC_SUPABASE_URL` a
   la URL real del proyecto (`https://TU_PROJECT_REF.supabase.co`) y las
   keys por las de **Project Settings → API** de ese proyecto — ya no
   necesitas el truco de `host` interno de Docker porque ahora es una
   URL pública real.
5. Repite el mismo checklist del paso 3 contra el proyecto en la nube
   antes de considerarlo tu entorno final.

## Accesibilidad

- Etiquetas semánticas (`header`, `nav`, `main`, `fieldset`/`legend`).
- Todos los campos tienen `label` asociado; errores anunciados con
  `role="alert"` y `aria-describedby`.
- Modal con `role="dialog"`, `aria-modal`, cierre con `Escape` y clic
  fuera del panel.
- Notificaciones con `aria-live="polite"`.
- Estados de foco visibles (`:focus-visible`) y navegación completa por
  teclado.
- Respeta `prefers-reduced-motion` (desactiva animaciones).
- Botones con área táctil mínima de 44px en toda la interfaz.

## Responsive

- **Escritorio**: tres tarjetas de partidas por fila; registro dividido en
  tres columnas (reglas, mascota, formulario).
- **Tablet**: dos tarjetas por fila; mascota y formulario reducidos.
- **Móvil**: una tarjeta por fila, formulario debajo de la mascota, modal
  casi a pantalla completa.

## Restricciones respetadas

- Sin pagos, depósitos, retiros ni criptomonedas reales.
- Sin recursos ni logos de Dota 2 (todos los escudos de equipo son SVG
  originales dibujados para este proyecto).
- Apuestas entre jugadores con cuota fija 1.80 y emparejamiento parcial —
  ver "Motor de emparejamiento real" arriba. La plataforma nunca asume
  riesgo de mercado: su comisión es fija por volumen emparejado.
- Mascota oficial sin modificar, con animación flotante y resplandor.
- Avisos de 18+ y juego responsable visibles en ambas pantallas.
#   l a _ p a n a d e r i a _ d e _ m a s o k u 
 
 