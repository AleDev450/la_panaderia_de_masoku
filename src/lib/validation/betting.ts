import { z } from "zod";

const money = z
  .number()
  .positive("El monto debe ser mayor a 0.")
  .refine((v) => Math.round(v * 100) === v * 100, {
    message: "El monto admite máximo 2 decimales.",
  });

export const crearApuestaSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
  lado: z.enum(["a", "b"]),
  monto: money,
});
export type CrearApuestaInput = z.infer<typeof crearApuestaSchema>;

export const cancelarApuestaSchema = z.object({
  apuestaId: z.string().uuid("Apuesta inválida."),
});
export type CancelarApuestaInput = z.infer<typeof cancelarApuestaSchema>;

export const resolverEventoSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
  resultado: z.enum(["a", "b"]),
});
export type ResolverEventoInput = z.infer<typeof resolverEventoSchema>;
