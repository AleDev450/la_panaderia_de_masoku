import { z } from "zod";
import { MONTO_MAX, MONTO_MIN, MONTO_PASO } from "@/lib/recargas";

export const crearRecargaSchema = z.object({
  monto: z
    .number()
    .min(MONTO_MIN, `El monto mínimo de recarga es S/${MONTO_MIN}.`)
    .max(MONTO_MAX, `El monto máximo de recarga es S/${MONTO_MAX}.`)
    .refine((v) => v % MONTO_PASO === 0, {
      message: `El monto debe ser múltiplo de S/${MONTO_PASO}.`,
    }),
  comprobante: z
    .string()
    .min(1, "Adjunta una imagen del comprobante de depósito.")
    .startsWith("data:image/", "El comprobante debe ser una imagen."),
});
export type CrearRecargaInput = z.infer<typeof crearRecargaSchema>;

export const resolverRecargaSchema = z.object({
  recargaId: z.string().uuid("Recarga inválida."),
  aprobar: z.boolean(),
  /** El admin puede corregir el monto tras mirar el comprobante; si no lo
   * manda, se acredita lo que declaró el jugador. Acá no se aplica el paso
   * de S/10 a propósito: el depósito real puede ser cualquier cifra. */
  montoAcreditado: z
    .number()
    .positive("El monto a acreditar debe ser mayor a 0.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    })
    .optional(),
});
export type ResolverRecargaInput = z.infer<typeof resolverRecargaSchema>;
