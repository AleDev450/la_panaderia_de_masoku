import { Apuesta, Evento } from "@/lib/supabase/types";

/** Cuota fija del motor — debe coincidir con `resolver_evento` en 0002_functions.sql. */
export const CUOTA = 1.8;

export const ESTADO_APUESTA_LABEL: Record<Apuesta["estado"], string> = {
  pendiente: "Esperando retador",
  parcial: "Emparejada en parte",
  completa: "Emparejada",
  cancelada: "Cancelada",
};

export function ladoLabel(evento: Evento, lado: Apuesta["lado"]): string {
  return lado === "a" ? evento.lado_a : evento.lado_b;
}

export interface LiquidacionApuesta {
  gano: boolean;
  /** Lo que se pagó al saldo por la parte emparejada (0 si perdió). */
  cobrado: number;
  /** Lo emparejado que se perdió (0 si ganó). */
  perdido: number;
  /** Lo que nunca llegó a emparejarse y volvió al saldo. */
  devuelto: number;
}

/**
 * Espejo en TS de lo que `resolver_evento` ya hizo en Postgres — solo para
 * mostrarlo en la UI. La fuente de verdad del dinero es el SQL, esto nunca
 * mueve saldo.
 */
export function liquidacionDeApuesta(
  apuesta: Apuesta,
  evento: Evento
): LiquidacionApuesta | null {
  if (evento.estado !== "resuelto" || !evento.resultado) return null;

  const gano = apuesta.lado === evento.resultado;
  const matcheado = Number(apuesta.monto_matcheado);
  return {
    gano,
    cobrado: gano ? Math.round(matcheado * CUOTA * 100) / 100 : 0,
    perdido: gano ? 0 : matcheado,
    // `monto_total - monto_matcheado`, no `monto_pendiente`: al liquidar,
    // resolver_evento devuelve lo no emparejado y deja monto_pendiente en
    // 0, así que leerlo aquí daría siempre 0 para un evento resuelto.
    devuelto: Number(apuesta.monto_total) - matcheado,
  };
}
