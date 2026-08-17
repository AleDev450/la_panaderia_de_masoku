import { z } from "zod";

export const actualizarNicknameSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(3, "El nickname debe tener entre 3 y 16 caracteres.")
    .max(16, "El nickname debe tener entre 3 y 16 caracteres.")
    .regex(/^[a-zA-Z0-9_]+$/, "El nickname solo puede tener letras, números y guión bajo."),
});
export type ActualizarNicknameInput = z.infer<typeof actualizarNicknameSchema>;

export const actualizarEmailSchema = z.object({
  email: z.string().trim().email("Ingresa un correo válido."),
});
export type ActualizarEmailInput = z.infer<typeof actualizarEmailSchema>;

export const solicitarCambioTelefonoSchema = z.object({
  telefonoNuevo: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "Ingresa un teléfono peruano válido de 9 dígitos."),
  motivo: z.string().trim().max(300, "El motivo es demasiado largo.").optional(),
});
export type SolicitarCambioTelefonoInput = z.infer<typeof solicitarCambioTelefonoSchema>;

export const resolverSolicitudTelefonoSchema = z.object({
  solicitudId: z.string().uuid("Solicitud inválida."),
  aprobar: z.boolean(),
});
export type ResolverSolicitudTelefonoInput = z.infer<typeof resolverSolicitudTelefonoSchema>;

/** Misma regla que en el registro (`validatePassword` en `src/lib/validation.ts`). */
const password = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .regex(/[a-zA-Z]/, "La contraseña debe combinar letras y números.")
  .regex(/[0-9]/, "La contraseña debe combinar letras y números.");

export const cambiarPasswordSchema = z.object({
  password,
});
export type CambiarPasswordInput = z.infer<typeof cambiarPasswordSchema>;

export const adminCambiarPasswordSchema = z.object({
  usuarioId: z.string().uuid("Usuario inválido."),
  password,
});
export type AdminCambiarPasswordInput = z.infer<typeof adminCambiarPasswordSchema>;
