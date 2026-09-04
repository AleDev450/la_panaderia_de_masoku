/**
 * Transmisión en vivo de la marca en Kick.
 *
 * Lógica pura y URLs, igual que `src/lib/apuestas.ts`: acá no se llama a
 * nadie. La consulta a Kick vive en `src/actions/stream.ts`, del lado del
 * servidor, porque la API de Kick no manda cabeceras CORS y desde el
 * navegador la llamada moriría sola.
 */

export const CANAL_KICK = "masokugg";

/** El canal, para abrirlo fuera de la web. */
export const URL_CANAL = `https://kick.com/${CANAL_KICK}`;

/**
 * Reproductor embebible. Arranca MUTEADO a propósito: los navegadores
 * bloquean el autoplay con sonido, así que sin `muted` el video simplemente
 * no empieza y parece que el embed está roto.
 */
export const URL_PLAYER = `https://player.kick.com/${CANAL_KICK}?autoplay=true&muted=true`;

/**
 * El chat. Es `/popout/<canal>/chat` y NO `/<canal>/chatroom`, que era la
 * dirección vieja y hoy devuelve 404.
 */
export const URL_CHAT = `https://kick.com/popout/${CANAL_KICK}/chat`;

/** Lo que la API pública de Kick dice del canal. */
export type EstadoStream = {
  enVivo: boolean;
  titulo: string | null;
  espectadores: number;
  /** ISO 8601, o null si no está al aire. */
  inicio: string | null;
  seguidores: number;
};

/**
 * Kick manda `start_time` como `"YYYY-MM-DD HH:MM:SS"`, sin marca de zona.
 * Es UTC: interpretarlo como hora de Lima da streams que empezaron en el
 * futuro (duraciones negativas), así que la 'Z' va sí o sí.
 */
export function fechaInicioKick(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  const fecha = new Date(`${crudo.replace(" ", "T")}Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/**
 * Cuánto lleva al aire, en corto: "3h 12min", "45min", "recién empezó".
 *
 * Devuelve null si la fecha no se entiende o si sale del futuro — más vale no
 * mostrar nada que mostrar "hace -2h".
 */
export function tiempoAlAire(inicioIso: string | null, ahora: number): string | null {
  if (!inicioIso) return null;

  const inicio = new Date(inicioIso).getTime();
  if (Number.isNaN(inicio)) return null;

  const minutos = Math.floor((ahora - inicio) / 60_000);
  if (minutos < 0) return null;
  if (minutos < 1) return "recién empezó";
  if (minutos < 60) return `${minutos}min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`;
}

/** Espectadores con separador de miles. */
export function formatearEspectadores(n: number): string {
  return n.toLocaleString("es-PE");
}
