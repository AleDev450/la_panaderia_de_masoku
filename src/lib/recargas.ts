/** Montos de recarga: de S/10 en S/10 hasta S/100. */
export const MONTO_MIN = 10;
export const MONTO_MAX = 100;
export const MONTO_PASO = 10;

export const MONTOS_RECARGA = Array.from(
  { length: (MONTO_MAX - MONTO_MIN) / MONTO_PASO + 1 },
  (_, i) => MONTO_MIN + i * MONTO_PASO
);

export const ESTADO_RECARGA_LABEL = {
  pendiente: "Pendiente de revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
} as const;

export const ESTADO_RECARGA_COLOR = {
  pendiente: "text-gold-light",
  aprobada: "text-win-glow",
  rechazada: "text-lose-glow",
} as const;
