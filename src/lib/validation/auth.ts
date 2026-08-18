import { z } from "zod";

/**
 * Validación del registro EN EL SERVIDOR. Antes `registerPlayer` no validaba
 * nada: una Server Action es un endpoint POST invocable directo, así que la
 * validación del formulario (src/lib/validation.ts) no era la única defensa
 * — era la ÚNICA, y se saltaba mandando el POST a mano. Así entró un
 * `full_name` con `<script>…</script>` (no se ejecuta —React escapa— pero
 * ensucia el panel y no debería poder guardarse).
 *
 * `full_name` prohíbe `< >` y saltos de línea: ningún nombre real los tiene,
 * y son justo los caracteres de una inyección. El nickname repite la misma
 * regla que el cliente (solo letras/números/guión bajo).
 */
export const registerPlayerSchema = z.object({
  email: z.string().trim().email("Ingresa un correo válido.").max(120, "Correo demasiado largo."),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(72, "La contraseña es demasiado larga.")
    .regex(/[a-zA-Z]/, "La contraseña debe combinar letras y números.")
    .regex(/[0-9]/, "La contraseña debe combinar letras y números."),
  nickname: z
    .string()
    .trim()
    .min(3, "El nickname debe tener entre 3 y 16 caracteres.")
    .max(16, "El nickname debe tener entre 3 y 16 caracteres.")
    .regex(/^[a-zA-Z0-9_]+$/, "El nickname solo puede tener letras, números y guión bajo."),
  fullName: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres.")
    .max(60, "El nombre es demasiado largo.")
    .regex(/^[^<>\r\n\t]+$/, "El nombre tiene caracteres no permitidos."),
  phone: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "Ingresa un teléfono peruano válido de 9 dígitos."),
});
