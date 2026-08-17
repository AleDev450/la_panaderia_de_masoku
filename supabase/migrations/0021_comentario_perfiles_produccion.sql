-- =============================================================================
-- LA PANCA — Corrige comentario desactualizado en `perfiles`
-- 0021_comentario_perfiles_produccion.sql
--
-- El comentario original ("No representa dinero real") quedó falso desde
-- que se integró Yape para recargas y retiros (ver 0009/0012). No es
-- user-facing, pero es la misma afirmación incorrecta que se sacó del
-- aviso de "Juego responsable" — corregirla acá evita que alguien la lea
-- por introspección de esquema y asuma que el saldo no es real.
-- =============================================================================

comment on table perfiles is 'Perfil de usuario y billetera interna (saldo disponible / retenido), respaldada por recargas y retiros reales vía Yape.';
