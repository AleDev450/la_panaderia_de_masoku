# LA PANADERÍA DE MASOKU

Apuestas peer-to-peer entre jugadores, con estética de fantasía medieval.
Mascota oficial: el "Guardián de la masa", un panadero de batalla.

> Proyecto de demostración. No procesa pagos, depósitos, retiros ni
> criptomonedas reales. Acceso restringido a mayores de 18 años —
> juego responsable.

## Cómo funciona

No hay casa que ponga el dinero: cada apuesta se empareja contra la de
quien eligió el lado contrario.

1. El staff publica un **título del día** (pregunta + lado A + lado B +
   categoría + minutos hasta el cierre).
2. Un jugador **abre sala**: elige un título, un lado y un monto
   (S/10–S/100). Necesita saldo, que carga yapeando al QR de la casa y
   subiendo la captura para que el staff la apruebe.
3. Otros lo **cubren por partes**. El emparejamiento es FIFO y parcial:
   varias personas pueden cubrir a una sola, con montos distintos. Nadie
   se empareja consigo mismo.
4. El staff **declara el resultado**. Lo emparejado ganador paga **1.80x**;
   lo que nadie cubrió vuelve entero al saldo. La plataforma se queda con
   0.20 por unidad emparejada — ganancia fija, sin riesgo de mercado.
5. Se reparten puntos: **+5** al que acertó, **+1** al que no (solo si
   llegó a emparejar algo). Los puntos suben el rango del panadero.
6. Para **retirar**, el jugador solicita un monto de su saldo disponible.
   Ese monto se aparta al instante — no se puede apostar ni pedir dos
   veces — y el staff lo yapea al número registrado y marca como pagado.

## Tecnologías

- Next.js (App Router) + React + TypeScript + Tailwind CSS v4
- Supabase Auth + Postgres. **Todo el estado vive en Postgres** — cuentas,
  apuestas, recargas y solicitudes. No queda nada en `localStorage`.
- Zod para validar entrada; Framer Motion para las animaciones.

## Instalación

```bash
npm install
cp .env.example .env.local   # completa las claves de Supabase
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # build de producción
npm run lint    # eslint
npm run test    # vitest (solo lógica pura, ver abajo)
```

## Configuración de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → ejecuta `supabase/migrations/*.sql` **en orden
   numérico**. Todas son idempotentes: si una falla a medias, puedes
   volver a correrla entera.
3. Copia `.env.example` → `.env.local` y completa las tres claves.
   `SUPABASE_SERVICE_ROLE_KEY` es secreta y salta RLS por completo — nunca
   la expongas al cliente ni la commitees.
4. Regístrate desde `/`. La fila en `perfiles` se crea sola vía trigger,
   siempre con `rol = 'user'`.
5. Para tener staff, promueve esa cuenta a mano:

```sql
update perfiles set rol = 'admin' where id = '<uuid-del-usuario>';
```

## Dónde vive la lógica de negocio

**En Postgres, no en TypeScript.** El emparejamiento, la retención de
saldo, la liquidación y el reparto de puntos son funciones PL/pgSQL
invocadas desde Server Actions con el cliente `service_role`. El cliente
nunca calcula dinero; a lo sumo valida antes de mandar (Zod) para dar
mensajes rápidos.

Consecuencia práctica: **`npm run test` no cubre el motor**. Vitest solo
prueba lógica pura de presentación (`src/lib/apuestas.ts`). Para validar
el motor de verdad hay que ejercitarlo contra la base — ver
[`docs/checklist-motor.md`](docs/checklist-motor.md).

Reglas que el SQL garantiza (no la UI):

- Monto entre S/10 y S/100, con saldo suficiente, retenido al apostar.
- Emparejamiento FIFO parcial; nadie se empareja consigo mismo.
- No se apuesta en títulos cerrados ni con el contador vencido.
- Un miembro del staff no puede apostar; un usuario suspendido tampoco.
- Solo se cancela la parte **no emparejada**; lo emparejado queda en juego.

## Estructura

```
src/
  app/                  Rutas (App Router)
    page.tsx            Registro / ingreso
    partidas/            Salas del día — el motor de apuestas
    mis-apuestas/         Apuestas activas, con cancelación parcial
    historial/            Apuestas resueltas: lo cobrado y lo devuelto
    ranking/               Ranking de puntos / niveles
    recargar/               Yapear al QR y subir el comprobante
    retirar/                 Solicitar retiro del saldo disponible
    perfil/                   Nickname, correo, solicitud de cambio de teléfono
    como-jugar/               Reglas del motor
  components/            Header, LevelBadge, guards de ruta, partidas/, auth/, ui/
  context/               Estado global: sesión y notificaciones
  data/                  Niveles del panadero
  lib/
    apuestas.ts           Cuota, pago redondeado y liquidación (solo UI)
    recargas.ts            Montos de recarga y etiquetas de estado
    image.ts                Compresión de comprobantes en el cliente
    supabase/                Clientes: navegador, sesión (RLS) y service_role
    validation/               Esquemas Zod
  services/
    userService.ts        Registro / ingreso contra Supabase Auth
  actions/                Server Actions — todo lo que toca dinero pasa por acá
  types/                  Tipos compartidos

supabase/migrations/     El motor: esquema, RLS y funciones PL/pgSQL
docs/checklist-motor.md  Cómo validar que el motor funciona de verdad
```

## Cuentas

El registro/login de jugadores y el del panel interno usan el **mismo
backend**: Supabase Auth + la tabla `perfiles`. Lo único que distingue a
un jugador del staff es `perfiles.rol`.

- **Registro**: `auth.admin.createUser` con `email_confirm: true` desde una
  Server Action, no `signUp` desde el navegador — así la cuenta queda lista
  sin depender de que el usuario confirme por correo. El correo es único.
- **Login**: `signInWithPassword`, luego se lee `perfiles` para el rol,
  saldo y puntos.

### Perfil del jugador

- **Nickname** — único, con comparación sin distinguir mayúsculas.
- **Correo** — se cambia en Supabase Auth, efectivo de inmediato.
- **Teléfono** — **no** se edita directo. El jugador manda una solicitud y
  el staff la aprueba. Se trata distinto a propósito: es el dato con el que
  se identifica de quién vino el depósito de una recarga, así que dejarlo
  editable abriría la puerta a reclamar depósitos ajenos. Un índice único
  parcial limita a una solicitud pendiente por usuario.

## Panel interno

La ruta del panel **no se documenta acá a propósito**. Eso no es una
medida de seguridad — es solo no repetirla de más. La protección real es
`RequireAdmin` en el cliente, RLS en cada tabla, y `es_admin()`
revalidado dentro de cada RPC; nada depende de que la URL sea difícil de
adivinar.

El staff no juega: `crear_apuesta` lo rechaza en SQL, y un guard de ruta
lo saca de las pantallas de juego. Su navegación no muestra apuestas,
ranking, historial ni recargar saldo, y tampoco ve saldo ni rango propios.

Lo que puede hacer:

- **Publicar títulos** del día, con categoría y contador.
- **Abrir y cerrar apuestas cuando quiera**, sin esperar al contador. El
  ciclo es **abierto → cerrado → resuelto**: "cerrado" significa que ya no
  entran apuestas pero el resultado todavía no se declara ni se paga. Al
  reabrir un título vencido, la función empuja el contador hacia adelante
  — si no, quedaría abierto pero rechazando por tiempo.
- **Declarar resultados**, lo que dispara la liquidación completa.
- **Revisar recargas**: el jugador yapea al QR (`public/images/yape-qr.jpg`)
  y sube la captura. El staff ve nickname, nombre y teléfono del jugador, amplía
  el comprobante para leer la hora y el monto, y **corrige el monto** si no
  coincide con lo declarado. Se guardan por separado `monto_solicitado` y
  `monto_acreditado`, así queda registro de la discrepancia. Aprobar
  acredita el saldo y cierra la recarga en una sola transacción.
- **Pagar retiros**: la cola muestra a quién yapear, a qué número y cuánto,
  con el total pendiente. El saldo del jugador ya está apartado desde que
  lo solicitó; marcarlo pagado lo saca definitivamente del sistema, y
  rechazarlo se lo devuelve con un motivo que el jugador ve.
- **Ver usuarios y el movimiento del día**: depositado, retirado, pagado en
  premios, y ganancia del día y acumulada.
- **Suspender cuentas** por incumplimiento. No borra nada: el usuario
  conserva saldo e historial y sus apuestas en curso se liquidan
  normalmente, solo no puede crear nuevas. Nadie puede suspenderse a sí
  mismo ni a otro miembro del staff.

## Seguridad

Modelo de amenaza asumido: **la anon key y el código del cliente son
públicos**, y las Server Actions son endpoints POST que cualquiera puede
invocar. Nada de lo que valida el navegador cuenta como defensa.

- **RLS en todas las tablas.** `perfiles`, `recargas`, `apuestas`,
  `movimientos_saldo` y `solicitudes_telefono` se leen solo en la fila
  propia (o todas, si eres staff). **Ninguna tiene policy de UPDATE ni
  DELETE**, así que con RLS activo eso queda denegado por defecto: un
  cliente no puede tocarse el saldo, levantarse una suspensión ni
  aprobarse una recarga.
- **Los inserts están acotados por columna**: un jugador solo puede crear
  recargas y solicitudes suyas y en estado `pendiente`. Los campos de
  revisión los escribe únicamente el RPC correspondiente.
- **Toda mutación de dinero pasa por RPC `SECURITY DEFINER`** con
  `GRANT EXECUTE` restringido a `service_role`. Reciben el id del actor
  como parámetro explícito en vez de `auth.uid()` porque se invocan con el
  cliente service_role, que no lleva JWT de usuario — el servidor resuelve
  ese id desde la cookie de sesión **antes** de llamar, y la función
  revalida `es_admin()` por su cuenta.
- **`server-only`** en el cliente service_role: importarlo desde un
  componente de cliente es un error de build, no una fuga silenciosa.
- **La sesión se refresca en el proxy** para todas las rutas. Sin eso, el
  access token expira (~1 h) y las Server Actions empiezan a responder
  "Debes iniciar sesión" aunque la sesión se vea activa.

Ver `supabase/migrations/0011_rls_hardening.sql` para dos huecos que se
encontraron y cerraron: `perfiles` era legible por cualquier usuario
autenticado (filtraba teléfonos y saldos de todos), y los inserts no
restringían columnas.

### Limitaciones conocidas

- **El registro no tiene rate limiting.** Usar `auth.admin.createUser`
  para saltar la confirmación por correo también saltea el rate limit que
  Supabase aplica a `signUp`. Alguien podría scriptear creación de
  cuentas.
- **Sin baneo por IP.** Se registra quién y cuándo suspendió una cuenta,
  pero bloquear IPs necesita una tabla de direcciones vetadas y un chequeo
  en el proxy.
- **Los comprobantes se guardan como texto** (data URL) en Postgres. Para
  producción corresponde Supabase Storage con signed URLs.
- **Sin paginación** en los listados del panel.

## Accesibilidad

Etiquetas semánticas, todos los campos con `label`, errores anunciados con
`role="alert"`, modales con `role="dialog"` y cierre con `Escape`,
notificaciones `aria-live`, foco visible, navegación completa por teclado,
respeto a `prefers-reduced-motion`, y área táctil mínima de 44px.

## Arte

La pantalla de registro/ingreso usa las ilustraciones reales de la marca
como fondo, con inputs de verdad encima. `ArtPanel` fija el `aspect-ratio`
del PNG para que las posiciones en porcentaje se mantengan alineadas en
cualquier viewport.

Los escudos de rango (`public/images/levels/nivel-N.png`) se usan tanto en
el ranking como para identificar a cada retador en las salas. Si un lado
no tiene retador, se pinta un escudo neutro con "?".

## Restricciones respetadas

- Sin pagos, depósitos, retiros ni criptomonedas reales.
- Sin recursos ni logos de terceros.
- Mascota oficial sin modificar.
- Avisos de 18+ y juego responsable visibles.
