import { User } from "@/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Perfil } from "@/lib/supabase/types";
import { registerPlayer } from "@/actions/auth";

/**
 * Auth de jugadores y de /bakery — ambos corren contra Supabase Auth real
 * (mismo backend que el motor /exchange). El registro/login de jugadores
 * usó antes un mock en localStorage; ver git history si necesitas
 * recuperar esa versión.
 */

export class UserServiceError extends Error {}

function toUser(perfil: Perfil): User {
  return {
    id: perfil.id,
    fullName: perfil.full_name ?? "",
    phone: perfil.phone ?? "",
    nickname: perfil.nickname,
    balance: perfil.saldo_disponible,
    puntos: perfil.puntos,
    rol: perfil.rol,
    createdAt: perfil.created_at,
  };
}

async function fetchPerfil(userId: string): Promise<Perfil> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error || !data) {
    throw new UserServiceError("Tu cuenta no tiene un perfil asociado.");
  }
  return data;
}

export interface RegisterInput {
  fullName: string;
  phone: string;
  nickname: string;
  email: string;
  password: string;
}

/**
 * Crea la cuenta vía `registerPlayer` (Server Action, cliente admin con
 * `email_confirm: true`) para que el registro nunca dependa de que el
 * usuario confirme por correo, y de inmediato inicia sesión con las
 * mismas credenciales — el registro siempre deja sesión activa.
 */
export async function registerUser(input: RegisterInput): Promise<User> {
  const result = await registerPlayer({
    email: input.email.trim(),
    password: input.password,
    nickname: input.nickname.trim(),
    fullName: input.fullName.trim(),
    phone: input.phone,
  });
  if (!result.ok) {
    throw new UserServiceError(result.error);
  }

  return loginUser({ email: input.email, password: input.password });
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function loginUser(input: LoginInput): Promise<User> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });
  if (error || !data.user) {
    throw new UserServiceError("Correo o contraseña incorrectos.");
  }

  return toUser(await fetchPerfil(data.user.id));
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    return toUser(await fetchPerfil(userId));
  } catch {
    return null;
  }
}

/** Ranking de "panaderos más gosus": todos los usuarios, ordenados por puntos desc. */
export async function listUsersRanking(): Promise<User[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("perfiles")
    .select("*")
    .eq("rol", "user")
    .order("puntos", { ascending: false });
  if (error || !data) return [];
  return data.map(toUser);
}
