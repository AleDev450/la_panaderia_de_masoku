/** Retiro mínimo — debe coincidir con el check en `solicitar_retiro` (0012). */
export const RETIRO_MIN = 10;

export const ESTADO_RETIRO_LABEL = {
  pendiente: "Pendiente de pago",
  pagado: "Pagado",
  rechazado: "Rechazado",
} as const;

export const ESTADO_RETIRO_COLOR = {
  pendiente: "text-gold-light",
  pagado: "text-win-glow",
  rechazado: "text-lose-glow",
} as const;
