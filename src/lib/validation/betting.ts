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

export const crearEventoSchema = z.object({
  nombre: z.string().trim().min(5, "El título debe tener al menos 5 caracteres."),
  ladoA: z.string().trim().min(1, "Indica el lado A (p.ej. GANA)."),
  ladoB: z.string().trim().min(1, "Indica el lado B (p.ej. PIERDE)."),
  categoria: z.enum(["dota2", "csgo", "lol", "valorant", "otros"]),
  duracionMin: z.number().int().min(1, "La duración debe ser de al menos 1 minuto."),
});
export type CrearEventoInput = z.infer<typeof crearEventoSchema>;
