-- =============================================================================
-- Seed opcional para desarrollo local. NO ejecutar en producción.
-- Requiere que ya existan usuarios reales en auth.users (créalos primero
-- desde Supabase Auth o el signup de la app), luego ajusta los UUID abajo.
-- =============================================================================

-- Ejemplo de evento de prueba:
-- insert into eventos (nombre, lado_a, lado_b) values
--   ('Crimson Forge vs Lunar Wardens', 'Crimson Forge', 'Lunar Wardens');

-- Ejemplo de alta de saldo demo para un usuario ya registrado en auth.users:
-- update perfiles set saldo_disponible = 250 where id = '00000000-0000-0000-0000-000000000000';

-- Ejemplo para promover un usuario a admin (requerido por resolver_evento):
-- update perfiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000000';
