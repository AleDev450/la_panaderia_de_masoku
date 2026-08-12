-- =============================================================================
-- LA PANCA — Endurecimiento de RLS
-- 0011_rls_hardening.sql: cierra dos huecos encontrados en una revisión.
--
-- 1. FUGA DE DATOS (grave). `perfiles_select_authenticated` (0005) dejaba
--    que CUALQUIER usuario autenticado leyera la tabla `perfiles` entera.
--    Como la anon key viaja al navegador, bastaba con tener una cuenta y
--    consultar PostgREST para volcar el teléfono, el nombre completo y el
--    saldo de todos los jugadores. De hecho ni hacía falta: /ranking hacía
--    `select("*")` desde el cliente, así que esos datos ya llegaban al
--    navegador de cualquiera que abriera esa pantalla.
--
--    Esa policy existía solo para que el ranking pudiera leer nickname y
--    puntos de todos. Ahora el ranking pasa por una Server Action con el
--    cliente service_role que devuelve únicamente esas dos columnas
--    (`getRanking` en src/actions/perfil.ts), así que la tabla vuelve a
--    ser privada: cada quien su fila, y el admin todas.
--
-- 2. INSERTS SIN RESTRINGIR (medio). Las policies de insert de `recargas`
--    y `solicitudes_telefono` solo validaban `auth.uid() = usuario_id`,
--    sin limitar las demás columnas. Un cliente hecho a mano podía crear
--    su propia recarga ya marcada `estado = 'aprobada'` con el
--    `monto_acreditado` que quisiera. No movía saldo (eso solo lo hace el
--    RPC), pero se saltaba la cola del admin y mostraba en el historial
--    del jugador una recarga aprobada que nunca lo fue.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. perfiles: vuelve a ser privada
-- ---------------------------------------------------------------------------

drop policy if exists perfiles_select_authenticated on perfiles;
drop policy if exists perfiles_select_own on perfiles;

create policy perfiles_select_own on perfiles
  for select using (auth.uid() = id or es_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Inserts acotados: el cliente solo puede crear filas "pendientes" a su
--    propio nombre. Los campos de revisión los escribe únicamente el RPC
--    correspondiente (security definer), que corre fuera de RLS.
-- ---------------------------------------------------------------------------

drop policy if exists recargas_insert_own on recargas;
create policy recargas_insert_own on recargas
  for insert with check (
    auth.uid() = usuario_id
    and estado = 'pendiente'
    and monto_acreditado is null
    and revisado_por is null
    and revisado_at is null
  );

drop policy if exists solicitudes_telefono_insert_own on solicitudes_telefono;
create policy solicitudes_telefono_insert_own on solicitudes_telefono
  for insert with check (
    auth.uid() = usuario_id
    and estado = 'pendiente'
    and revisado_por is null
    and revisado_at is null
  );

-- ---------------------------------------------------------------------------
-- Nota sobre lo que NO necesita policy: `perfiles`, `recargas`,
-- `solicitudes_telefono`, `apuestas`, `movimientos_saldo` y
-- `emparejamientos` no tienen policies de UPDATE ni DELETE. Con RLS
-- activo eso significa denegado por defecto — ningún cliente puede
-- modificar su saldo, levantarse un baneo ni aprobarse una recarga.
-- Toda mutación pasa por los RPC SECURITY DEFINER.
-- ---------------------------------------------------------------------------
