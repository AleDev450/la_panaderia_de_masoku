import { z } from "zod";

export const registrarPagoManualSchema = z.object({
  concepto: z
    .string()
    .trim()
    .min(3, "Indica a quién o para qué se pagó.")
    .max(200, "Máximo 200 caracteres."),
  monto: z
    .number()
    .positive("El monto debe ser mayor a 0.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
});
export type RegistrarPagoManualInput = z.infer<typeof registrarPagoManualSchema>;
