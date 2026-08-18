-- =============================================================================
-- LA PANCA — Registrar la IP del cliente (para rastrear/bloquear abusos)
-- 0033_registrar_ip.sql
--
-- Problema: cuando una cuenta ataca con un script, banearla no bastaba y no
-- había forma de saber su IP desde la app — solo vivía en los logs de Vercel
-- (que en el plan Hobby se borran a las pocas horas). Ahora se guarda:
--
--   perfiles.ip_registro : desde qué IP se creó la cuenta. Es la señal más
--     confiable porque el registro SIEMPRE pasa por el servidor
--     (registerPlayer, que necesita el service_role) — no se puede falsear
--     desde el cliente.
--   recargas.ip          : desde qué IP se mandó esa "captura" puntual.
--
-- Con eso, el panel muestra la IP al lado de cada cuenta/recarga y se puede
-- pegar directo en el Firewall de Vercel (IP Blocking) para cortarla.
-- =============================================================================

alter table perfiles add column if not exists ip_registro text;
alter table recargas add column if not exists ip text;
