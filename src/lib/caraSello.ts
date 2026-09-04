import { LadoMoneda } from "@/lib/supabase/types";

/**
 * Lógica pura de cara o sello (0049). Igual que `src/lib/apuestas.ts`: esto
 * es presentación, no motor. El resultado y el pago los decide
 * `jugar_cara_sello` en Postgres; acá solo se calcula lo que se MUESTRA
 * (cuánto pagaría una apuesta) y hacia dónde tiene que caer la moneda.
 */

export const LADO_MONEDA_LABEL: Record<LadoMoneda, string> = {
  cara: "Cara",
  sello: "Sello",
};

/** Duración del giro de la moneda. Suficiente para que se lea como sorteo y
 * no tanto como para volverse tedioso al jugar varias seguidas. */
export const DURACION_MONEDA_MS = 3200;

/** Vueltas completas antes de mostrar el resultado. */
export const VUELTAS_MONEDA = 5;

/** Lo que se acredita si gana. Espejo de `round(monto * multiplicador, 2)`. */
export function pagoCaraSello(monto: number, multiplicador: number): number {
  return Math.round(monto * multiplicador * 100) / 100;
}

/** Lo que suma o resta al saldo: ganar 1.8x sobre 10 deja +8, no +18. */
export function gananciaNeta(monto: number, pago: number): number {
  return Math.round((pago - monto) * 100) / 100;
}

/**
 * Dónde tiene que frenar la moneda. Cara mira al frente (múltiplo de 360),
 * sello queda volteada (media vuelta más), así que el ángulo final ES el
 * resultado: la animación no puede terminar mostrando algo distinto a lo que
 * mandó el backend.
 */
export function rotacionFinalMoneda(resultado: LadoMoneda): number {
  return VUELTAS_MONEDA * 360 + (resultado === "sello" ? 180 : 0);
}
