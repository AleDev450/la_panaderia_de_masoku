# CACHUDOBET

Apuestas peer-to-peer entre jugadores. Identidad oscura, amarilla y
deportiva; la cara de la marca es Masoku.

> **Rebrand.** El proyecto nació como "La Panadería de Masoku" y conserva
> nombres internos de esa etapa que NO se renombraron a propósito, porque
> tocarlos sería un find/replace masivo sin ganancia funcional:
> la ruta de administración `/bakery`, y los tokens de color
> (`obsidian`, `parchment`, `gold`, `crimson`) cuyos VALORES sí cambiaron
> —ver la tabla de traducción en `src/app/globals.css`.

> Proyecto de demostración. No procesa pagos, depósitos, retiros ni
> criptomonedas reales. Acceso restringido a mayores de 18 años —
> juego responsable.

## Cómo funciona

No hay casa que ponga el dinero: cada apuesta se empareja contra la de
quien eligió el lado contrario.

1. El staff publica un **título del día** (pregunta + lado A + lado B +
   categoría + minutos hasta el cierre).
2. Un jugador **abre sala**: elige un título, un lado y un monto
   (S/5–S/100). Necesita saldo, que carga yapeando al QR de la casa y
   subiendo la captura para que el staff la apruebe.
3. Otros lo **cubren por partes**. El emparejamiento es FIFO y parcial:
   varias personas pueden cubrir a una sola, con montos distintos. Nadie
   se empareja consigo mismo.
4. El staff **declara el resultado**, que abre una ventana de 1 minuto
   para corregirlo antes de que se mueva un sol. Al confirmar, lo
   emparejado ganador paga **1.80x**; lo que nadie cubrió vuelve entero al
   saldo. La plataforma se queda con 0.20 por unidad emparejada —
   ganancia fija, sin riesgo de mercado… salvo que haya saldo fake de por
   medio (ver abajo).
5. Se reparten puntos: **+5** al que acertó, **+1** al que no (solo si
   llegó a emparejar algo). Los puntos suben el rango del cachudo.
6. Para **retirar**, el jugador solicita un monto de su saldo disponible.
   Ese monto se aparta al instante — no se puede apostar ni pedir dos
   veces — y el staff lo yapea al número registrado y marca como pagado.
7. **Blackjack** es una categoría aparte (0039). El staff publica una mesa
   madre; de ahí en adelante las salas se clonan solas. El jugador entra
   desde la tarjeta de la mesa **eligiendo lado**: si ese asiento está
   tomado en todas las mesas, se le abre una nueva y queda ahí con su monto
   esperando retador — nunca se le rebota por "ocupado" (0041). Son de **dos
   personas** (una apuesta por lado) y **sin reloj**: la mano corre hasta
   que el staff declare. Los montos NO tienen que coincidir — se emparejan
   parcial como en todo el motor, y lo que nadie cubrió vuelve al saldo. La
   app **no reparte cartas ni cuenta puntos**: el jugador marca "pedir" o
   "quedarse" y el staff lo ve en vivo en /bakery/titulos, que refresca solo.
   **Lado A = el jugador** (pide cartas); **lado B = la banca** — quien apostó
   ahí no decide nada, porque la mano de la banca la juega el que reparte
   siguiendo la regla de la casa (0040). El staff no confirma cada carta:
   solo mira el contador.
8. Aparte hay **sorteos**: el staff publica uno, el jugador deja su perfil
   de Steam y su Discord en `/sorteos`, el staff le escribe a mano cuántos
   **tickets** le tocan (según el tier que compró) y sortea con un botón —
   al azar ponderado por tickets, resuelto en Postgres para que no se pueda
   volver a tirar hasta que salga quien uno quiere.

9. **La ruleta** (0048) es un pozo común, no un emparejamiento. Cada S/3
   compra un ticket; todo lo que entra forma el pozo y al cerrar la ronda se
   sortea UN ticket. El ganador se lleva el 80% y la casa el 20% —
   porcentajes editables desde el panel, no clavados en el código. Cada
   ticket es una **fila propia** con su código, así que el sorteo es un
   `order by random() limit 1` uniforme: tener diez tickets es tener diez
   filas, y ahí está toda la ponderación. **Solo el staff gira**; el jugador
   no tiene botón.
10. **Cara o sello** es un duelo 1v1 (0050; nació contra la casa en 0049 y se
    cambió). Uno abre una sala con su lado y su monto —que queda retenido
    esperando—, otro se sienta enfrente con el **mismo monto**, y ahí cae la
    moneda: `random()` en Postgres, en la misma transacción que mueve el
    saldo de los dos. El ganador cobra 1.80x y la casa se queda 0.20 por sol,
    la misma comisión fija del motor: gane quien gane, la casa gana lo mismo.
    El navegador solo anima hacia el lado que la base ya decidió.

### Cómo se ve el mismo sorteo en todas las pantallas

Sin websockets: el proyecto no tiene realtime y no se le agregó uno.

`admin_girar_ruleta` elige al ganador, lo paga, lo escribe, y recién entonces
fija `giro_inicia_en = now() + 3s`. Los clientes preguntan cada 2s y, cuando
ven esa marca, **calculan la animación en función del tiempo transcurrido
desde ella**, no desde que se enteraron. Quien llegó tarde no arranca de cero:
se engancha al giro donde ya iba y frena en el ganador en el mismo instante
que el resto. La cuenta regresiva de 3 segundos es el colchón que cubre la
latencia del poll.

Para que el ancla sirva hay que medir contra el reloj correcto: cada lectura
trae el `now()` de Postgres (`ahora_servidor()`) y el cliente corrige el
desfase de su propio reloj. Comparar contra el reloj del navegador —o contra
el del servidor de Next, que es otra máquina— haría que dos pantallas frenaran
en momentos distintos.

### Las tres formas de darle saldo a alguien

No son intercambiables. Elegir mal descuadra la caja:

| Herramienta | ¿Es plata que entró? | ¿Cuenta como ingreso? |
| --- | --- | --- |
| **Registrar ingreso del día** (0044, en /bakery/pagos) | Sí — efectivo, transferencia | Sí, y sube el total esperado. Acredita el saldo en la misma operación |
| **Ajustar saldo** (0024, en /bakery/usuarios) | No, es una corrección | No. Regalar saldo así sale de lo tuyo |
| **Dar saldo fake** (0036) | No, no es plata | No, ni siquiera se puede retirar |

`yape_esperado` es el total entre **Yape y efectivo**, no solo el teléfono
(el nombre de la columna quedó de cuando solo se modelaba el Yape).

### Saldo fake (0036)

El staff puede darle a una cuenta **saldo fake** — plata de mentira que
sirve para que haya con quién emparejar. Va en columnas aparte
(`saldo_fake` / `saldo_fake_retenido`), así que no cuenta como depósito, no
se puede retirar y no entra en la reconciliación de Yape. Una apuesta es
100% fake o 100% real: el saldo fake se gasta primero, pero solo si alcanza
para cubrir la apuesta entera.

Ahí es donde la casa **sí** corre riesgo. Por cada sol emparejado contra
una apuesta fake:

| Emparejamiento | Resultado para la casa |
| --- | --- |
| real vs real | +0.20 (la comisión de siempre) |
| fake vs fake | 0 (no se movió un sol de verdad) |
| gana el real | **−0.80** — el premio de 1.80 lo pone la casa |
| gana el fake | **+1.00** — el perdedor real pierde su plata de verdad |

Por eso `comisiones_plataforma.monto` es el *resultado real* del evento y
puede ser negativo. La cuenta completa está en
`supabase/migrations/0036_saldo_fake.sql`.

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

- Monto entre S/5 y S/100 (0047), con saldo suficiente, retenido al apostar.
- Emparejamiento FIFO parcial; nadie se empareja consigo mismo.
- **Un solo bando por sala**: si ya apostaste a un lado, el contrario te
  rechaza — cubrirse a sí mismo no es apostar.
- No se apuesta en títulos cerrados, con el contador vencido, o con el
  resultado ya declarado.
- **Un evento no se puede pagar dos veces**: la liquidación exige que no
  esté `resuelto` y lo marca como tal en la misma transacción en la que
  mueve el dinero, con la fila bloqueada.
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
    ruleta/                   Ronda con pozo: comprar tickets y ver el giro
    cara-o-sello/             Lobby de duelos 1v1 a la moneda
    sorteos/                  Inscribirse a un sorteo con Steam + Discord
    perfil/                   Nickname, correo, solicitud de cambio de teléfono
    como-jugar/               Reglas del motor
  components/            Header, LevelBadge, guards de ruta, partidas/, auth/, ui/
  context/               Estado global: sesión y notificaciones
  data/                  Niveles del panadero
  lib/
    apuestas.ts           Cuota, pago redondeado y liquidación (solo UI)
    ruleta.ts              Tickets por monto, reparto del pozo y la curva del giro
    caraSello.ts           Pago de la moneda y hacia dónde tiene que caer
    markdown.tsx           Mini-markdown de los sorteos (negrita, links, color)
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
- **Declarar el resultado en dos fases.** Declarar **no paga**: guarda un
  ganador preliminar y abre una ventana de 1 minuto en la que se puede
  corregir **una sola vez** (el contador se reinicia al corregir, para
  poder revisar la corrección). Recién al confirmar se reparte el dinero.
  Así un clic equivocado deja de ser irreversible.

  > Sin `pg_cron`, el pago automático al vencer el minuto lo dispara el
  > propio panel: si nadie lo tiene abierto, el evento queda declarado sin
  > pagar hasta que alguien vuelva a entrar.
- **Girar la ruleta** (0048). El ciclo es **borrador → abierta → cerrada →
  girando → finalizada**. Solo se gira una ronda cerrada y solo una vez: el
  RPC bloquea la fila y exige que el ganador todavía no esté escrito, así que
  dos clics simultáneos no sortean dos veces. También puede agregar tickets a
  mano para quien pagó por fuera (no descuenta saldo, pero sí suma al pozo).
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

> ⚠️ Un archivo `"use server"` **solo admite exports de funciones async**.
> Exportar una constante desde ahí anula en silencio todos los exports del
> módulo, y ni `tsc` ni eslint lo detectan — solo revienta en runtime. Por
> eso valores compartidos como `VENTANA_CORRECCION_MS` viven en
> `src/lib/`, no en `src/actions/`.

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
