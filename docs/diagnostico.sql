-- =============================================================================
-- Diagnóstico rápido: "el saldo no se movió" / "no veo el saldo del usuario"
--
-- Corre esto en el SQL Editor de Supabase. Reemplaza 'NICKNAME' por el
-- nickname del jugador. Cada bloque dice qué esperar.
-- =============================================================================

-- 1) ¿Qué migraciones están aplicadas?
--    Si falta alguna, ese es el primer sospechoso.
select
  (select count(*) from information_schema.columns
     where table_name='eventos' and column_name='resultado_preliminar') = 1 as m0013_dos_fases,
  (select count(*) from information_schema.tables
     where table_name='retiros') = 1 as m0012_retiros,
  (select count(*) from information_schema.tables
     where table_name='recargas') = 1 as m0009_recargas,
  (select count(*) from pg_policies
     where tablename='perfiles' and policyname='perfiles_select_authenticated') = 0 as m0011_rls_cerrada;
-- Esperado: todo true. Un false = esa migración falta.


-- 2) Estado actual del jugador
select id, nickname, rol, baneado,
       saldo_disponible, saldo_retenido,
       saldo_disponible + saldo_retenido as total_en_sistema,
       puntos
from perfiles where nickname = 'NICKNAME';
-- `saldo_retenido` > 0 con todo resuelto = hay dinero atrapado (ver bloque 5).


-- 3) Sus apuestas: ¿llegaron a emparejar algo?
select a.created_at, e.nombre, a.lado,
       a.monto_total, a.monto_matcheado, a.monto_pendiente, a.estado,
       e.estado as estado_evento, e.resultado
from apuestas a
join eventos e on e.id = a.evento_id
where a.usuario_id = (select id from perfiles where nickname = 'NICKNAME')
order by a.created_at desc;
--
-- CLAVE: si apostó a los DOS lados del mismo evento, `monto_matcheado`
-- será 0 en ambas. `crear_apuesta` nunca empareja a alguien consigo mismo,
-- así que ninguna de las dos encuentra contraparte. Al resolver, las dos
-- se devuelven enteras y el saldo queda EXACTAMENTE IGUAL que antes.
-- Eso no es un bug: no ganó ni perdió porque nunca hubo apuesta real.


-- 4) La auditoría del dinero, movimiento por movimiento
select m.created_at, m.tipo, m.monto, e.nombre as evento
from movimientos_saldo m
left join eventos e on e.id = m.evento_id
where m.usuario_id = (select id from perfiles where nickname = 'NICKNAME')
order by m.created_at;
--
-- Debe cuadrar: cada 'retencion' de X tiene después su 'devolucion' de X
-- (si no emparejó), o un 'pago_ganancia' (si ganó lo emparejado), o nada
-- (si perdió lo emparejado, el retenido simplemente baja).
-- Sumas: recargas aprobadas + pago_ganancia + devolucion - retencion
--        - retiros pagados = saldo_disponible actual.


-- 5) ¿Hay saldo retenido que nadie va a liberar?
--    Pasa si un evento quedó declarado pero sin pagar.
select e.id, e.nombre, e.estado, e.resultado_preliminar, e.declarado_at,
       sum(a.monto_total) as retenido_en_este_evento
from eventos e
join apuestas a on a.evento_id = e.id
where e.estado <> 'resuelto' and a.estado <> 'cancelada'
group by e.id
order by e.created_at desc;
-- Si aparece algo con `resultado_preliminar` no nulo y `declarado_at`
-- viejo, abre el panel de títulos: se liquida al entrar.


-- 6) Sus recargas
select monto_solicitado, monto_acreditado, estado, created_at, revisado_at
from recargas
where usuario_id = (select id from perfiles where nickname = 'NICKNAME')
order by created_at desc;
-- Ojo: si usaste el botón "Borrar todas", las recargas desaparecen pero el
-- saldo que acreditaron SIGUE ahí. Por eso el total puede no cuadrar con
-- lo que ves en esta tabla.


-- 7) ¿El usuario aparece en el listado del panel?
--    El panel filtra por rol='user'. Si lo promoviste a admin, desaparece.
select nickname, rol, baneado from perfiles order by created_at desc limit 10;
