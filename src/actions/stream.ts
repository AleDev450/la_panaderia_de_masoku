"use server";

import { CANAL_KICK, EstadoStream, fechaInicioKick } from "@/lib/stream";
import { ActionResult } from "@/actions/betting";

/**
 * Estado del canal en Kick, consultado del lado del SERVIDOR.
 *
 * Va acá y no en el navegador por dos razones: la API de Kick no manda
 * cabeceras CORS —desde el cliente la llamada moriría sola— y así la web no
 * expone a cada visitante contra un servicio de terceros.
 *
 * NO ES CRÍTICO QUE FUNCIONE. Es solo el cartelito de "EN VIVO" y el conteo
 * de espectadores: si Kick no contesta, o mete un desafío de Cloudflare, o
 * cambia la forma de la respuesta, esto devuelve `ok: false` y la página
 * igual muestra el reproductor y el chat. El embed no depende de esta
 * llamada.
 */
export async function getEstadoStream(): Promise<ActionResult<EstadoStream>> {
  try {
    const respuesta = await fetch(`https://kick.com/api/v2/channels/${CANAL_KICK}`, {
      // Sin User-Agent de navegador, Cloudflare responde con un desafío.
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      // El dato cambia todo el tiempo (espectadores), así que no se cachea;
      // el refresco lo limita la página, que pregunta cada 60s.
      cache: "no-store",
      // Sin esto, un Kick lento cuelga el render de la página.
      signal: AbortSignal.timeout(6000),
    });

    if (!respuesta.ok) {
      return { ok: false, error: `Kick respondió ${respuesta.status}.` };
    }

    const datos = (await respuesta.json()) as {
      followers_count?: number;
      livestream?: {
        is_live?: boolean;
        session_title?: string;
        viewer_count?: number;
        start_time?: string;
      } | null;
    };

    // `livestream` es null cuando el canal está apagado — no es un error.
    const vivo = datos.livestream ?? null;

    return {
      ok: true,
      data: {
        enVivo: Boolean(vivo?.is_live),
        titulo: vivo?.session_title ?? null,
        espectadores: Number(vivo?.viewer_count ?? 0),
        inicio: fechaInicioKick(vivo?.start_time),
        seguidores: Number(datos.followers_count ?? 0),
      },
    };
  } catch {
    // Timeout, DNS, JSON roto: da igual cuál. La página se las arregla.
    return { ok: false, error: "No se pudo consultar el estado del canal." };
  }
}
