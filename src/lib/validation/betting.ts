import { z } from "zod";
import { BET_MAX, BET_MIN } from "@/types";

const money = z
  .number()
  .positive("El monto debe ser mayor a 0.")
  .refine((v) => Math.round(v * 100) === v * 100, {
    message: "El monto admite máximo 2 decimales.",
  });

export const crearApuestaSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
  lado: z.enum(["a", "b"]),
  // Los mismos límites que anuncia el arte del footer; `crear_apuesta`
  // los vuelve a validar en SQL (esta capa no es la única defensa).
  monto: money
    .min(BET_MIN, `La apuesta mínima es S/${BET_MIN}.`)
    .max(BET_MAX, `La apuesta máxima es S/${BET_MAX}.`),
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

export const eliminarEventoPruebaSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
});
export type EliminarEventoPruebaInput = z.infer<typeof eliminarEventoPruebaSchema>;

export const cancelarEventoSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
  motivo: z.string().trim().max(300, "El motivo es demasiado largo.").optional(),
});
export type CancelarEventoInput = z.infer<typeof cancelarEventoSchema>;
