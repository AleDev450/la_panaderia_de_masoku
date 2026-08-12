import { z } from "zod";

export const creditarSaldoSchema = z.object({
  usuarioId: z.string().uuid("Usuario inválido."),
  monto: z.number().positive("El monto debe ser mayor a 0."),
});
export type CreditarSaldoInput = z.infer<typeof creditarSaldoSchema>;

export const otorgarPuntosSchema = z.object({
  usuarioId: z.string().uuid("Usuario inválido."),
  puntos: z.number().int().positive("Los puntos deben ser mayores a 0."),
});
export type OtorgarPuntosInput = z.infer<typeof otorgarPuntosSchema>;
