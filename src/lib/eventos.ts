/**
 * Ventana para corregir un resultado antes de que se pague — debe
 * coincidir con el intervalo de `liquidar_eventos_vencidos` (0013).
 *
 * Vive acá y no en `src/actions/admin.ts` porque un archivo `"use server"`
 * solo admite exports de funciones async: exportar una constante desde ahí
 * anula en silencio TODOS los exports del módulo. Ni tsc ni eslint lo
 * detectan; solo revienta en runtime.
 */
export const VENTANA_CORRECCION_MS = 60_000;

/**
 * "Hoy" para /partidas y el panel de admin es el día calendario en Perú,
 * no en el huso horario donde corra el servidor (típicamente UTC) ni el
 * de `toISOString()` (siempre UTC, sin importar la hora local del
 * navegador). Sin esto, desde las 7pm hora Perú (medianoche UTC) en
 * adelante el día "cambia" para la app un rato antes de que cambie de
 * verdad en Perú — justo el síntoma reportado.
 *
 * Perú no usa horario de verano (UTC-5 fijo), pero se resuelve con el
 * nombre real de la zona vía Intl en vez de un "-5" a mano, para que
 * quede explícito de dónde sale el número.
 */
const ZONA_PERU = "America/Lima";

function partesEnPeru(referencia: Date): { y: string; m: string; d: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_PERU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referencia);
  const get = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** "YYYY-MM-DD" del día calendario actual en Perú. */
export function hoyIsoEnPeru(referencia: Date = new Date()): string {
  const { y, m, d } = partesEnPeru(referencia);
  return `${y}-${m}-${d}`;
}

/** Instante UTC exacto de la medianoche de un "YYYY-MM-DD" en Perú —
 * medianoche en Perú (UTC-5 fijo) son siempre las 05:00 UTC del mismo
 * día calendario. */
export function inicioDeDiaEnPeru(fechaIso: string): Date {
  return new Date(`${fechaIso}T05:00:00.000Z`);
}

/** Instante UTC exacto de la medianoche de hoy en Perú — para filtrar
 * "desde el inicio del día" contra columnas timestamptz. */
export function inicioDeHoyEnPeru(referencia: Date = new Date()): Date {
  return inicioDeDiaEnPeru(hoyIsoEnPeru(referencia));
}
