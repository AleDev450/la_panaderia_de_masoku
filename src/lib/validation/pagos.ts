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

const motivoAjuste = z
  .string()
  .trim()
  .min(3, "Indica el motivo del ajuste.")
  .max(200, "Máximo 200 caracteres.");

export const ajustarSaldoSchema = z.object({
  usuarioId: z.string().uuid("Usuario inválido."),
  nuevoSaldo: z
    .number()
    .nonnegative("El saldo no puede ser negativo.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
  motivo: motivoAjuste,
});
export type AjustarSaldoInput = z.infer<typeof ajustarSaldoSchema>;

export const registrarAjusteYapeSchema = z.object({
  monto: z
    .number()
    .refine((v) => v !== 0, "El monto debe ser distinto de 0.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
  motivo: motivoAjuste,
});
export type RegistrarAjusteYapeInput = z.infer<typeof registrarAjusteYapeSchema>;
