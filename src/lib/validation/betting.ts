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
  // Tiene que coincidir con el enum `categoria_evento` de Postgres: lo que
  // falte acá se rechaza como "datos inválidos" antes de llegar a la base,
  // aunque la base sí lo acepte. 'baccarat' entró en 0054.
  categoria: z.enum(["dota2", "csgo", "lol", "valorant", "otros", "blackjack", "baccarat"]),
  /** Se ignora en blackjack: esas mesas se abren sin reloj (ver 0039). */
  duracionMin: z.number().int().min(1, "La duración debe ser de al menos 1 minuto."),
});
export type CrearEventoInput = z.infer<typeof crearEventoSchema>;

/** Sentarse en una mesa de blackjack. Se elige LADO, no sala: el motor
 * busca una mesa con ese lado libre y, si están todas tomadas, abre una
 * nueva y te sienta ahí en el mismo lado (0041). */
export const unirseBlackjackSchema = z.object({
  lado: z.enum(["a", "b"]),
  monto: money
    .min(BET_MIN, `La apuesta mínima es S/${BET_MIN}.`)
    .max(BET_MAX, `La apuesta máxima es S/${BET_MAX}.`),
});
export type UnirseBlackjackInput = z.infer<typeof unirseBlackjackSchema>;

export const marcarTurnoSchema = z.object({
  eventoId: z.string().uuid("Mesa inválida."),
  accion: z.enum(["pedir", "quedarse"]),
});
export type MarcarTurnoInput = z.infer<typeof marcarTurnoSchema>;



export const eliminarEventoPruebaSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
});
export type EliminarEventoPruebaInput = z.infer<typeof eliminarEventoPruebaSchema>;

export const cancelarEventoSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
  motivo: z.string().trim().max(300, "El motivo es demasiado largo.").optional(),
});
export type CancelarEventoInput = z.infer<typeof cancelarEventoSchema>;
