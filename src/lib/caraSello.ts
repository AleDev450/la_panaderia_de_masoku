import { CaraSelloSala, LadoMoneda } from "@/lib/supabase/types";

/**
 * Lógica pura de cara o sello 1v1 (0049 + 0050). Igual que
 * `src/lib/apuestas.ts`: esto es presentación, no motor. El resultado y el
 * pago los decide `unirse_cara_sello` en Postgres; acá solo se calcula lo que
 * se MUESTRA (cuánto pagaría una apuesta) y hacia dónde tiene que caer la
 * moneda.
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

/**
 * Con qué lado juega alguien en un duelo. El creador eligió el suyo; al que
 * se sienta enfrente le toca el contrario, siempre — no se guarda en la fila
 * porque se deduce, y un dato duplicado es un dato que se puede contradecir.
 *
 * `null` si la persona no juega en esa sala (o si nadie se ha sentado todavía).
 */
export function ladoDe(
  sala: Pick<CaraSelloSala, "creador_id" | "rival_id" | "lado_creador">,
  usuarioId: string
): LadoMoneda | null {
  if (sala.creador_id === usuarioId) return sala.lado_creador;
  if (sala.rival_id === usuarioId) return sala.lado_creador === "cara" ? "sello" : "cara";
  return null;
}

/** Lo que cobra el ganador. Espejo de `round(monto * multiplicador, 2)`. */
export function pagoCaraSello(monto: number, multiplicador: number): number {
  return Math.round(monto * multiplicador * 100) / 100;
}

/** Lo que suma o resta al saldo: ganar 1.8x sobre 10 deja +8, no +18. */
export function gananciaNeta(monto: number, pago: number): number {
  return Math.round((pago - monto) * 100) / 100;
}

/**
 * Lo que se queda la casa en un duelo: el pozo (los dos montos) menos el
 * premio. Con 1.8x son 0.20 por sol apostado, la misma comisión fija que
 * cobra el motor de apuestas — y sale igual salga cara o sello, así que la
 * casa no corre riesgo. Espejo de lo que hace `unirse_cara_sello`.
 */
export function comisionDelDuelo(monto: number, multiplicador: number): number {
  return Math.round((monto * 2 - pagoCaraSello(monto, multiplicador)) * 100) / 100;
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
