import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Tope de acciones por `clave` en una ventana de tiempo. Devuelve `true` si
 * la acción está permitida, `false` si ya se pasó del límite. El conteo real
 * vive en Postgres (`rate_limit_check`, ver 0031) para que sobreviva a
 * reinicios y sea el mismo entre varias instancias del server.
 *
 * Falla ABIERTO (permite) si el RPC no existe todavía o da error: así se
 * puede desplegar este código ANTES de correr la migración 0031 sin romper
 * el registro ni las recargas. Un limitador que se cae no debe tumbar la
 * app entera.
 *
 * @param clave    identificador del bucket, ej. `registro:<ip>` o `recarga:<userId>`
 * @param max      cuántas veces se permite dentro de la ventana
 * @param ventanaSegundos  largo de la ventana en segundos
 */
export async function dentroDeLimite(
  clave: string,
  max: number,
  ventanaSegundos: number
): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("rate_limit_check", {
      p_clave: clave,
      p_max: max,
      p_ventana_segundos: ventanaSegundos,
    });
    if (error) return true; // fail-open
    return data !== false;
  } catch {
    return true; // fail-open
  }
}
