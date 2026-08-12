# Checklist: validar el motor de apuestas de verdad

"Compiló" no prueba nada de lo que importa acá: el emparejamiento parcial,
la cuota 1.80x, la devolución de lo no cubierto y los puntos viven en
PL/pgSQL, donde ningún test de TypeScript llega. Este checklist es la
única forma de saber que las migraciones `0006`–`0012` quedaron bien
aplicadas.

Corre las queries en **SQL Editor** de Supabase. Los pasos de UI, en la app.

---

## 0. Las migraciones están aplicadas

```sql
-- Esperado: 2 filas (categoria, cierra_en)
select column_name from information_schema.columns
where table_name = 'eventos' and column_name in ('categoria', 'cierra_en');

-- Esperado: 13 filas
select proname from pg_proc where proname in (
  'crear_apuesta', 'resolver_evento', 'handle_new_user',
  'admin_creditar_saldo', 'admin_otorgar_puntos', 'actualizar_nickname',
  'admin_resolver_solicitud_telefono', 'admin_resolver_recarga',
  'admin_banear_usuario', 'admin_cambiar_estado_evento', 'admin_metricas',
  'solicitar_retiro', 'admin_resolver_retiro'
);

-- Esperado: 4 filas (columnas de suspensión, migración 0010)
select column_name from information_schema.columns
where table_name = 'perfiles'
  and column_name in ('baneado', 'baneado_motivo', 'baneado_at', 'baneado_por');

-- Esperado: 3 filas (cola de teléfonos, recargas y retiros)
select tablename from pg_tables
where tablename in ('solicitudes_telefono', 'recargas', 'retiros');

-- Esperado: true (0012 agregó el tipo de movimiento del retiro)
select 'retiro' = any(enum_range(null::tipo_movimiento_saldo)::text[]) as tiene_retiro;

-- Esperado: que el cuerpo mencione 'puntos' (0007 aplicada) y que
-- crear_apuesta mencione 'cierra_en' (0006 aplicada)
select proname, prosrc like '%puntos = puntos +%' as reparte_puntos
from pg_proc where proname = 'resolver_evento';

select proname, prosrc like '%cierra_en%' as corta_por_tiempo
from pg_proc where proname = 'crear_apuesta';
```

Si `reparte_puntos` o `corta_por_tiempo` sale `false`, esa migración no se
aplicó — vuelve a correrla (todas son idempotentes).

---

## 1. Preparar dos cuentas con saldo

Necesitas **dos** cuentas de jugador (regístralas desde `/`) y una de
admin. Anota sus `id`:

```sql
select id, nickname, rol, saldo_disponible, saldo_retenido, puntos
from perfiles order by created_at desc limit 5;
```

Dales saldo de prueba (esto salta el flujo de recarga a propósito, para no
depender de aprobar comprobantes):

```sql
update perfiles set saldo_disponible = 500
where nickname in ('JUGADOR_A', 'JUGADOR_B');
```

---

## 2. Publicar un título y abrir sala

1. Entra como **admin** a `/bakery/titulos`.
2. Publica un título: nombre, categoría, lado A / lado B, y **60 minutos**
   de cierre (para tener margen mientras pruebas).
3. Entra como **jugador A** a `/partidas` → **Crear sala** → elige ese
   título, lado A, **S/100**.

Verifica el estado en SQL:

```sql
select a.monto_total, a.monto_matcheado, a.monto_pendiente, a.estado,
       p.nickname, p.saldo_disponible, p.saldo_retenido
from apuestas a join perfiles p on p.id = a.usuario_id
order by a.created_at desc limit 5;
```

**Esperado para A:** `monto_total 100`, `monto_matcheado 0`,
`monto_pendiente 100`, estado `pendiente`. Su `saldo_disponible` bajó 100
y `saldo_retenido` subió 100 — el dinero está retenido, no gastado.

---

## 3. Emparejamiento parcial (lo más importante)

Como **jugador B**, en esa misma sala apuesta **S/40 al lado contrario**.
Luego otra vez **S/20** al mismo lado contrario.

```sql
select p.nickname, a.lado, a.monto_total, a.monto_matcheado,
       a.monto_pendiente, a.estado
from apuestas a join perfiles p on p.id = a.usuario_id
where a.evento_id = 'EVENTO_ID'
order by a.created_at;
```

**Esperado:**

| quién | lado | total | matcheado | pendiente | estado |
|---|---|---|---|---|---|
| A | a | 100 | 60 | 40 | parcial |
| B | b | 40 | 40 | 0 | completa |
| B | b | 20 | 20 | 0 | completa |

Es decir: **varias personas cubrieron a una sola, por partes**. Si A
aparece `matcheado 0`, el matching no está corriendo.

```sql
-- Esperado: 2 filas, montos 40 y 20
select monto from emparejamientos where evento_id = 'EVENTO_ID';
```

En la UI, la tarjeta de `/partidas` debe mostrar a A con "faltan S/40", y
`/mis-apuestas` debe reflejar los mismos números.

---

## 4. Reglas que deben rechazar

Todas estas deben fallar con mensaje claro, no romperse:

- Apostar **S/5** o **S/150** → fuera del rango S/10–S/100.
- Apostar con **saldo 0** → te manda a `/recargar`.
- Que **A apueste al lado contrario en su propia sala** → se registra, pero
  **no se empareja consigo mismo** (`crear_apuesta` excluye `usuario_id`
  propio). Verifica que su `monto_matcheado` no suba por eso.
- Cambiar el `cierra_en` a pasado y volver a apostar:

```sql
update eventos set cierra_en = now() - interval '1 minute' where id = 'EVENTO_ID';
```
  → debe rechazar con "El título ya cerró para nuevas apuestas". Devuélvelo
  a futuro para seguir: `update eventos set cierra_en = now() + interval '1 hour' ...`

---

## 5. Resolver y verificar el dinero

Anota los saldos **antes** de resolver:

```sql
select nickname, saldo_disponible, saldo_retenido, puntos from perfiles
where nickname in ('JUGADOR_A', 'JUGADOR_B');
```

Como admin, en `/bakery/titulos`, declara **el lado A** como resultado.
Vuelve a correr la query de arriba.

**Esperado, con A ganador (100 pedidos, 60 emparejados):**

- **A** recibe `60 × 1.80 = 108` de premio **más** los `40` no emparejados
  que se devuelven → `saldo_disponible` sube **148**. `saldo_retenido`
  vuelve a 0. `puntos` **+5**.
- **B** pierde los 60 emparejados (ya estaban retenidos) → su
  `saldo_retenido` baja 60 y su `saldo_disponible` no cambia. `puntos`
  **+1** por cada apuesta emparejada.

```sql
-- La plataforma se queda con 0.20 por unidad emparejada: 60 × 0.20 = 12
select monto from comisiones_plataforma where evento_id = 'EVENTO_ID';

-- Auditoría completa del movimiento de dinero
select p.nickname, m.tipo, m.monto
from movimientos_saldo m join perfiles p on p.id = m.usuario_id
where m.evento_id = 'EVENTO_ID' order by m.created_at;
```

**La cuenta que tiene que cuadrar:** se emparejaron 60 por lado = pozo de
120. El ganador se lleva 108, la plataforma 12. `108 + 12 = 120`. ✅

En la UI, `/historial` debe mostrarle a A "Ganaste S/108 · devuelto S/40",
y el ranking/insignia debe reflejar los puntos nuevos.

---

## 5b. Recargas (el flujo que antes vivía en localStorage)

Esta es la prueba que antes era imposible: **usa dos navegadores distintos**
(o uno normal y otro en incógnito), uno con el jugador y otro con el admin.

1. Como **jugador**, en `/recargar`: elige S/50, sube cualquier imagen y
   envía. Debe aparecer en "Tus recargas" como *Pendiente de revisión*.
2. Como **admin**, en `/bakery/recargas`: **la recarga tiene que verse ahí**.
   Si no aparece, la migración `0009` no está aplicada o el jugador no es
   quien crees.
3. Verifica que se muestren **nickname, nombre completo y teléfono**.
4. Haz clic en la miniatura → el comprobante se abre a pantalla completa;
   el botón **Ampliar** hace zoom al 200 %.
5. **Corrige el monto**: escribe `30` en el campo y aprueba.

```sql
select r.monto_solicitado, r.monto_acreditado, r.estado, p.nickname, p.saldo_disponible
from recargas r join perfiles p on p.id = r.usuario_id
order by r.created_at desc limit 3;
```

**Esperado:** `monto_solicitado 50`, `monto_acreditado 30`, estado
`aprobada`, y el `saldo_disponible` del jugador subió **30**, no 50. Queda
registro de que declaró 50 pero se le acreditó 30.

6. Intenta aprobar **la misma recarga otra vez** (recarga la página y
   vuelve a darle) → debe rechazar con "Esta recarga ya fue revisada". Eso
   confirma que no se puede acreditar saldo dos veces.

---

## 5bis. Retiros

Lo que hay que probar es que **el saldo se aparta al solicitar**, no al
pagar. Si no, el mismo dinero se podría apostar o pedir dos veces mientras
la solicitud espera.

Como jugador con saldo (digamos S/148 disponible tras §5), en `/retirar`
pide **S/100**.

```sql
select saldo_disponible, saldo_retenido from perfiles where nickname = 'JUGADOR_A';
select monto, telefono_destino, estado from retiros order by created_at desc limit 1;
```

**Esperado:** `saldo_disponible` bajó 100 y `saldo_retenido` subió 100 — el
dinero sigue en el sistema pero ya no es gastable. El retiro queda
`pendiente` con el teléfono del perfil como destino.

Ahora comprueba que **ese saldo ya no se puede usar**:

- Intenta apostar más de lo que queda disponible → "Saldo disponible
  insuficiente".
- Intenta pedir un segundo retiro → "Ya tienes un retiro pendiente de pago".

**Marcar pagado** (como staff, en la cola de retiros):

```sql
select saldo_disponible, saldo_retenido from perfiles where nickname = 'JUGADOR_A';
select tipo, monto from movimientos_saldo
where usuario_id = (select id from perfiles where nickname = 'JUGADOR_A')
order by created_at desc limit 2;
```

**Esperado:** `saldo_retenido` bajó 100 y `saldo_disponible` **no cambió** —
el dinero salió del sistema. Queda un movimiento `retiro` de 100.

**Rechazar** (repite con otro retiro): `saldo_retenido` baja 100 y
`saldo_disponible` sube 100, con un movimiento `devolucion`. El jugador ve
el motivo en `/retirar`.

---

## 5c. Controles de administración

**El admin no juega.** Entra como admin y escribe a mano
`http://localhost:3000/partidas` → debe rebotarte a `/bakery`. Lo mismo
con `/mis-apuestas`, `/historial`, `/ranking` y `/recargar`. En el header
no debe aparecer ninguno de esos enlaces, ni el saldo.

La defensa real está en SQL, no en la UI. Compruébalo saltándote la
pantalla — con el `id` de tu admin:

```sql
select crear_apuesta('ID_DEL_ADMIN', 'EVENTO_ID', 'a', 20);
-- Esperado: ERROR "Un administrador no puede apostar"
```

**Abrir y cerrar a mano.** En `/bakery/titulos`, sobre un título abierto:

1. **Cerrar** → la insignia pasa a *Cerrado · sin pagar* y un jugador que
   intente apostar recibe "El evento no está abierto para apuestas".
2. **Abrir** → vuelve a aceptar apuestas. Prueba esto con un título cuyo
   contador **ya venció**: al reabrir, `cierra_en` debe empujarse hacia
   adelante, si no quedaría abierto pero rechazando por tiempo.

```sql
select estado, cierra_en > now() as contador_vigente
from eventos where id = 'EVENTO_ID';
```

**Suspender una cuenta.** En `/bakery/usuarios`, suspende a un jugador con
un motivo. Luego, **como ese jugador**, intenta apostar → "Tu cuenta está
suspendida".

```sql
select nickname, baneado, baneado_motivo, saldo_disponible
from perfiles where nickname = 'JUGADOR_A';
```

**Esperado:** `baneado true`, el motivo guardado, y **el saldo intacto** —
suspender no confisca dinero. Levanta la suspensión y confirma que puede
volver a apostar.

También verifica que el admin **no puede suspenderse a sí mismo** ni a
otro admin (la UI solo lista jugadores, pero el RPC lo rechaza igual):

```sql
select admin_banear_usuario('ID_DEL_ADMIN', 'ID_DEL_ADMIN', true, 'test');
-- Esperado: ERROR "No puedes suspender tu propia cuenta"
```

**Métricas.** En `/bakery`, los cuatro números de "Hoy" deben cuadrar con:

```sql
select * from admin_metricas('ID_DEL_ADMIN');
```

Tras el escenario de §5 (60 emparejados, A ganó), `pagado_hoy` debe ser
108 y `ganancia_hoy` 12.

---

## 6. Perfil

- `/perfil` → cambia tu nickname por uno que **ya tenga** la otra cuenta →
  debe rechazar con "Ese nickname ya está en uso".
- Cambia tu correo → cierra sesión → **entra con el correo nuevo**.
- Solicita cambio de teléfono → como admin, apruébalo en
  `/bakery/telefonos` → confirma que `perfiles.phone` cambió.
- Intenta mandar una **segunda** solicitud sin que la primera se resuelva →
  debe rechazar ("Ya tienes una solicitud pendiente").

---

## 7. Sesión de larga duración

El bug que motivó ampliar el `matcher` de `src/proxy.ts`: el access token
de Supabase dura ~1 hora. Deja la app abierta más de una hora **sin
recargar** y luego intenta apostar. Debe funcionar. Si responde "Debes
iniciar sesión", el refresco de sesión del proxy no está cubriendo esa
ruta.

---

## Limpiar después de probar

```sql
-- Ojo: borra TODAS las apuestas del evento de prueba.
delete from emparejamientos where evento_id = 'EVENTO_ID';
delete from movimientos_saldo where evento_id = 'EVENTO_ID';
delete from comisiones_plataforma where evento_id = 'EVENTO_ID';
delete from apuestas where evento_id = 'EVENTO_ID';
delete from eventos where id = 'EVENTO_ID';

-- Recargas y solicitudes de prueba
delete from recargas where usuario_id in (
  select id from perfiles where nickname in ('JUGADOR_A', 'JUGADOR_B')
);
delete from solicitudes_telefono where usuario_id in (
  select id from perfiles where nickname in ('JUGADOR_A', 'JUGADOR_B')
);
```
