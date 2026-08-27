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

/**
 * Saldo fake (0036). A diferencia de `ajustarSaldoSchema`, que FIJA el
 * saldo en un valor, este SUMA — por eso el monto puede ser negativo (para
 * quitarle fake a alguien) pero nunca 0.
 */
export const darSaldoFakeSchema = z.object({
  usuarioId: z.string().uuid("Usuario inválido."),
  monto: z
    .number()
    .refine((v) => v !== 0, "El monto debe ser distinto de 0.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
  motivo: motivoAjuste,
});
export type DarSaldoFakeInput = z.infer<typeof darSaldoFakeSchema>;

/**
 * Plata que entró sin pasar por el flujo de recargas (0044): efectivo,
 * transferencia, lo que sea. Si viene con `usuarioId`, se le acredita el
 * saldo en la misma operación — registrar y acreditar por separado es lo
 * que lleva a contar el mismo dinero dos veces.
 */
export const registrarIngresoSchema = z.object({
  concepto: z
    .string()
    .trim()
    .min(3, "Indica de dónde vino la plata.")
    .max(200, "Máximo 200 caracteres."),
  monto: z
    .number()
    .positive("El monto debe ser mayor a 0.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
  /** A quién acreditarle el saldo. Vacío = la plata no le dio saldo a nadie. */
  usuarioId: z.string().uuid("Usuario inválido.").optional().or(z.literal("")),
});
export type RegistrarIngresoInput = z.infer<typeof registrarIngresoSchema>;

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
