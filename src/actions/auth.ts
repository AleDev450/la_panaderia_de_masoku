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
 *
 * Nickname y teléfono se revisan ANTES de tocar Auth, no después: así el
 * jugador sabe exactamente cuál de los tres (correo, nickname o teléfono)
 * ya está en uso, en vez de un "no pudimos crear tu cuenta" genérico —
 * y de paso se evita crear una cuenta de Auth a medias que luego haya que
 * limpiar por un choque que se pudo detectar antes.
 */
export async function registerPlayer(
  input: RegisterPlayerInput
): Promise<ActionResult<{ userId: string }>> {
  const admin = createSupabaseAdminClient();

  const [{ data: nicknameChoque }, { data: phoneChoque }] = await Promise.all([
    admin.from("perfiles").select("id").ilike("nickname", input.nickname).maybeSingle(),
    admin.from("perfiles").select("id").eq("phone", input.phone).maybeSingle(),
  ]);
  if (nicknameChoque) {
    return { ok: false, error: "Ese nickname ya existe." };
  }
  if (phoneChoque) {
    return { ok: false, error: "Ese número de teléfono ya existe." };
  }

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
      error: isDuplicate ? "Ese correo ya existe." : "No pudimos crear tu cuenta.",
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
    // usable igual — nickname y teléfono ya se confirmaron libres arriba.
    const { error: perfilError } = await admin.from("perfiles").insert({
      id: userId,
      nickname: input.nickname,
      rol: "user",
      full_name: input.fullName,
      phone: input.phone,
    });

    if (perfilError) {
      // Sin perfil la cuenta es inservible: se borra el usuario de Auth
      // para no dejar una cuenta zombi con la que nadie puede entrar.
      await admin.auth.admin.deleteUser(userId);
      // Carrera rarísima: alguien tomó el mismo nickname/teléfono entre el
      // chequeo de arriba y este insert. El texto que manda Postgres en
      // "details" dice qué columna chocó — se usa para no volver a caer
      // en un mensaje genérico.
      const detalle =
        perfilError.message + " " + ((perfilError as { details?: string }).details ?? "");
      return {
        ok: false,
        error:
          perfilError.code !== "23505"
            ? "No pudimos crear tu perfil."
            : /nickname/i.test(detalle)
              ? "Ese nickname ya existe."
              : /phone/i.test(detalle)
                ? "Ese número de teléfono ya existe."
                : "Ese teléfono o nickname ya existe.",
      };
    }
  }

  return { ok: true, data: { userId } };
}
