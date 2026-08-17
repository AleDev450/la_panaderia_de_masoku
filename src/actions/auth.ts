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
 *
 * El trigger `handle_new_user` normalmente crea la fila en `perfiles`,
 * pero acá se verifica y se crea si falta. Sin eso, un trigger ausente
 * deja una cuenta de Auth sin perfil, y el síntoma es desconcertante: la
 * app te da por deslogueado (getUserById devuelve null al no encontrar
 * perfil) y al reintentar login parece que la contraseña está mal.
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

  const userId = data.user.id;

  const { data: perfil } = await admin
    .from("perfiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!perfil) {
    // El trigger no corrió. Se crea la fila acá para que la cuenta quede
    // usable igual; si el nickname choca se le añade un sufijo, la misma
    // regla que aplica `handle_new_user`.
    const { data: choque } = await admin
      .from("perfiles")
      .select("id")
      .ilike("nickname", input.nickname)
      .maybeSingle();

    const nickname = choque ? `${input.nickname}_${userId.slice(0, 6)}` : input.nickname;

    const { error: perfilError } = await admin.from("perfiles").insert({
      id: userId,
      nickname,
      rol: "user",
      full_name: input.fullName,
      phone: input.phone,
    });

    if (perfilError) {
      // Sin perfil la cuenta es inservible: se borra el usuario de Auth
      // para no dejar una cuenta zombi con la que nadie puede entrar.
      await admin.auth.admin.deleteUser(userId);
      return {
        ok: false,
        error:
          perfilError.code === "23505"
            ? "Ese teléfono o nickname ya está registrado."
            : "No pudimos crear tu perfil.",
      };
    }
  }

  return { ok: true, data: { userId } };
}
