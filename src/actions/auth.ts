"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ActionResult } from "@/actions/betting";

export interface RegisterPlayerInput {
  email: string;
  password: string;
  nickname: string;
  fullName: string;
  phone: string;
}

/**
 * Crea la cuenta con el cliente admin (service_role) y `email_confirm:
 * true` — el registro de jugadores no debe depender de que abran un
 * correo de confirmación ni del toggle "Confirm email" del dashboard de
 * Supabase, tiene que quedar listo para iniciar sesión de inmediato.
 * `handle_new_user` (0004/0005) igual dispara y crea la fila en
 * `perfiles`, sea que el usuario se cree por `signUp` o por esta vía.
 */
export async function registerPlayer(
  input: RegisterPlayerInput
): Promise<ActionResult<{ userId: string }>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      nickname: input.nickname,
      full_name: input.fullName,
      phone: input.phone,
    },
  });

  if (error || !data.user) {
    // Supabase cambia la redacción exacta de este error entre versiones
    // ("User already registered", "already been registered",
    // code: "email_exists"…) — se detecta por varias señales a la vez en
    // vez de un solo substring frágil.
    const isDuplicate =
      error?.code === "email_exists" ||
      /already.*regist|regist.*already/i.test(error?.message ?? "");
    return {
      ok: false,
      error: isDuplicate ? "Ya existe una cuenta con ese correo." : "No pudimos crear tu cuenta.",
    };
  }

  return { ok: true, data: { userId: data.user.id } };
}
