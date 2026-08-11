# LA PANCA

Aplicación web responsive de apuestas **1 contra 1** entre jugadores, con
estética de fantasía medieval / MOBA original. Mascota oficial: el
"Guardián de la masa", un panadero de batalla (`public/images/mascot.png`).

> Proyecto de demostración. No procesa pagos, depósitos, retiros ni
> criptomonedas reales. Acceso restringido a mayores de 18 años —
> juego responsable.

## Tecnologías

- Next.js (App Router) + React + TypeScript
- Tailwind CSS v4
- Framer Motion (animaciones de la mascota, toasts, modal)
- Datos simulados en `src/data`, persistidos en `localStorage` a través de
  servicios independientes en `src/services` (ver más abajo cómo
  conectarlos a una API real)
- Supabase (Postgres + RLS + RPC en PL/pgSQL) + Zod para el motor de
  emparejamiento real bajo `/exchange` (ver esa sección más abajo)

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
    admin/                  Panel admin (RequireAdmin)
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
    userService.ts        registro / ingreso / puntos / ranking (mock, localStorage)
    recargaService.ts     validar y registrar recargas con comprobante
    apiClient.ts          wrapper fetch listo para una API REST real
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

## Panel de administración, títulos, recargas y niveles

Sobre el demo 1:1 (mock, `localStorage`) se agregó una capa de
administración y progresión de jugadores:

### Cuenta admin de demostración

Se crea sola la primera vez que abres la app (`ensureSeedAdmin` en
`src/services/userService.ts`):

- Teléfono: `999999999`
- Nickname: `AdminPanca`
- Contraseña: `admin1234`

Inicia sesión con esos datos para ver el enlace **Admin** en el header y
acceder a `/admin`.

### Títulos de apuesta (`/admin/titulos`)

Antes, las 3 partidas del día eran datos fijos en `src/data/matches.ts`.
Ahora un admin puede publicar nuevos **títulos de apuesta** (pregunta +
lado A + lado B + hora) desde `/admin/titulos`; aparecen de inmediato en
`/partidas` para que los usuarios elijan sobre cuál apostar —
`MatchesContext.createTitulo()`.

Cada título tiene un **contador de cierre** (`duracionMin`, 10 minutos
por defecto, editable por título en el mismo panel admin). Mientras el
contador corre, el título acepta retos y aceptaciones normalmente
(`isMatchOpen` en `betService.ts`); al vencer, `createChallenge` /
`acceptChallenge` rechazan cualquier intento nuevo y la tarjeta muestra
"Título cerrado". `CountdownBadge` pinta la cuenta regresiva en vivo
tanto en `/partidas` como en `/admin/titulos`.

Cuando el admin declara el resultado (**Declarar GANA** / **Declarar
PIERDE**), `resolveMatch` reparte puntos al duelo emparejado de ese
título (ver niveles abajo) y el título queda `resuelto` — ya no acepta
más acciones.

### Recargas con comprobante (`/recargar` y `/admin/recargas`)

Un usuario sube el monto depositado + una foto/captura del comprobante
(`/recargar`); la imagen se comprimen en el navegador
(`src/lib/image.ts`, redimensiona a 1000px y reexporta a JPEG) antes de
guardarse como `data:` URL, para no agotar la cuota de `localStorage`.
La recarga queda `pendiente`.

Un admin revisa la hora del depósito en la imagen desde
`/admin/recargas` y marca **Marcar correcto** (acredita el monto a
`saldo_disponible` del usuario) o **Marcar incorrecto** — nunca se
acredita saldo sin ese comprobante.

### Niveles y ranking (`/ranking`)

Cada usuario tiene un contador de `puntos` (`src/types/index.ts`). Al
resolver un título con duelo emparejado:

- El lado que acertó el resultado: **+5 puntos**.
- El lado que no: **+1 punto** (participar en un duelo resuelto siempre
  puntúa, nunca 0).

Los niveles son bandas de 10 puntos con nombres temáticos de panadería
(`src/data/levels.ts`: Masa → Fermento → Horneado → … → Guardián de la
Masa). `LevelBadge` los pinta con un emoji provisional por nivel —
reemplázalo por las imágenes reales de badges apenas estén listas
(basta con mapear `level.id` a un `<Image>` ahí en vez del emoji).
`/ranking` lista a todos los usuarios ordenados por puntos — "los
panaderos más gosus" de LA PANCA.

## Conectar una API REST (Laravel u otra)

El proyecto está preparado para reemplazar los datos simulados sin tocar
la UI:

1. Define `NEXT_PUBLIC_API_BASE_URL` en `.env.local` apuntando a tu API.
2. En `src/services/userService.ts`, reemplaza las funciones
   `registerUser` / `loginUser` (hoy leen/escriben `localStorage`) por
   llamadas a `apiRequest` (`src/services/apiClient.ts`) contra tus
   endpoints, por ejemplo `POST /auth/register` y `POST /auth/login`.
3. En `src/context/MatchesContext.tsx`, sustituye el estado inicial
   (`initialMatches` desde `src/data/matches.ts`) por un `fetch` a
   `GET /matches`, y haz que `publishChallenge` / `takeChallenge` llamen a
   `POST /matches/:id/challenges` y `POST /challenges/:id/accept` en lugar
   de mutar el estado local directamente.
4. Los tipos en `src/types/index.ts` (`User`, `Match`, `Team`, `Bet`,
   `BetSide`, `PendingChallenge`, `PairedBet`) están pensados para
   coincidir 1:1 con el payload JSON que devolvería la API — reutilízalos
   como contrato.

La lógica de validación (`betService.ts`) puede mantenerse en el
frontend como validación optimista, mientras el backend aplica la misma
regla como fuente de verdad.

## Motor de emparejamiento real (Supabase/Postgres) — `/exchange`

Además del demo 1:1 de arriba (mock, sin cuotas), el proyecto incluye un
segundo módulo, independiente: un **motor de apuestas peer-to-peer con
order book y cuota fija 1.80**, con el matching y la liquidación
resueltos enteramente en Postgres (no en el cliente ni en JS del
servidor), pensado para producción.

> ⚠️ Modelo económico distinto al demo 1:1: aquí sí hay una cuota fija
> (1.80) y una comisión de plataforma garantizada. Es un motor separado,
> vive bajo `/exchange/[eventoId]`, y **no** está conectado al login mock
> de `/` — usa Supabase Auth de verdad (ver "Conectar el login" abajo).

### Configuración

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → ejecuta en orden:
   - `supabase/migrations/0001_schema.sql` (tablas, enums, índices, RLS)
   - `supabase/migrations/0002_functions.sql` (RPC: `crear_apuesta`,
     `cancelar_apuesta`, `resolver_evento`)
   - opcional: `supabase/migrations/0003_seed.sql` (comentado, contiene
     ejemplos para crear un evento de prueba y dar saldo demo)
3. Copia `.env.example` → `.env.local` y completa `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (esta
   última es secreta, solo se usa en el servidor — nunca la expongas al
   cliente).
4. Crea un usuario en **Authentication → Users**, luego en la tabla
   `perfiles` asegúrate de que exista su fila (nickname, saldo) y, si vas
   a probar `resolver_evento`, márcalo `rol = 'admin'`.
5. Inserta un evento de prueba (ver ejemplos comentados en `0003_seed.sql`)
   y visita `/exchange/<id-del-evento>`.

### Piezas

```
supabase/migrations/
  0001_schema.sql     Enums, tablas, índices, RLS
  0002_functions.sql  crear_apuesta / cancelar_apuesta / resolver_evento
  0003_seed.sql        Ejemplos comentados para desarrollo local
src/lib/supabase/
  server.ts            Cliente ligado a la sesión del usuario (RLS activo)
  admin.ts              Cliente service_role — SOLO server actions, nunca cliente
  types.ts               Tipos TS espejo del esquema SQL
src/lib/validation/betting.ts   Esquemas Zod (montos positivos, 2 decimales)
src/actions/betting.ts           Server actions: crearApuesta, cancelarApuesta,
                                  resolverEvento, getOrderBook, getMisApuestas, getEvento
src/components/exchange/         OrderBookPanel + CreateBetForm (ejemplo de UI)
src/app/exchange/[eventoId]/      Página de ejemplo que consume todo lo anterior
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

### Conectar el login real (pendiente)

Este motor asume Supabase Auth. El login/registro de `/` sigue siendo el
mock de `userService.ts` (localStorage) del demo 1:1, y no crea sesiones
de Supabase. Para unificarlos: reemplaza `registerUser` / `loginUser`
por `supabase.auth.signUp` / `signInWithPassword` (cliente en el
navegador), crea la fila correspondiente en `perfiles` en el callback de
registro, y listo — `requireSessionUserId()` en `betting.ts` empezará a
reconocer esa sesión automáticamente.

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

No te quedes en "compiló" — esto es lo que de verdad hay que probar
antes de dar por bueno el motor de apuestas:

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

# d) El matching y la liquidación calculan bien (ejecuta esto contra
#    supabase_db_la-panaderia con psql o desde el SQL Editor de Studio,
#    http://localhost:54423): crea dos perfiles + un evento, llama
#    crear_apuesta() con lados opuestos y mismo monto, confirma que
#    quedó en emparejamientos y que monto_matcheado/estado se actualizó
#    en ambas apuestas, luego llama resolver_evento() y confirma que el
#    saldo se mueve exactamente como en "Modelo económico" (pool - 0.20
#    × monto = comisión, el resto es 1.80× para el ganador).
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
- Demo 1:1 (`/`, `/partidas`…) sin odds/cuotas: solo GANA / PIERDE, pozo
  1:1. El motor `/exchange` es un módulo aparte con cuota fija 1.80 —
  ver sección "Motor de emparejamiento real" arriba.
- Mascota oficial sin modificar, con animación flotante y resplandor.
- Avisos de 18+ y juego responsable visibles en ambas pantallas.
#   l a _ p a n a d e r i a _ d e _ m a s o k u  
 