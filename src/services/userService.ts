import { User } from "@/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Mock auth "database" backed by localStorage. Structure kept deliberately
 * close to a REST payload so swapping this module for real `fetch` calls to
 * a Laravel API later is a drop-in replacement (see README).
 */
const USERS_KEY = "lapanca:users";
const DEMO_BALANCE = 250;

const SEED_ADMIN_PHONE = "999999999";
const SEED_ADMIN_NICKNAME = "AdminMasoku";
const SEED_ADMIN_PASSWORD = "admin1234";

export class UserServiceError extends Error {}

/** Stored record includes the password hash; never returned to callers/UI. */
type StoredUser = User & { passwordHash: string };

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * SHA-256 via Web Crypto so the demo never keeps plaintext passwords in
 * localStorage. This is NOT how a real backend should hash passwords —
 * a Laravel API should use bcrypt/argon2 server-side (see README).
 */
async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toPublicUser(stored: StoredUser): User {
  return {
    id: stored.id,
    fullName: stored.fullName,
    phone: stored.phone,
    nickname: stored.nickname,
    balance: stored.balance,
    puntos: stored.puntos,
    rol: stored.rol,
    createdAt: stored.createdAt,
  };
}

/**
 * Crea la cuenta admin de demostración la primera vez que se usa el
 * servicio en el navegador, para que /bakery sea navegable sin tener que
 * editar localStorage a mano. Ver README para las credenciales.
 */
export async function ensureSeedAdmin(): Promise<void> {
  if (typeof window === "undefined") return;
  const users = readUsers();
  if (users.some((u) => u.rol === "admin")) return;

  const admin: StoredUser = {
    id: makeId(),
    fullName: "Administrador Masoku",
    phone: SEED_ADMIN_PHONE,
    nickname: SEED_ADMIN_NICKNAME,
    balance: 0,
    puntos: 0,
    rol: "admin",
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(SEED_ADMIN_PASSWORD),
  };
  writeUsers([...users, admin]);
}

export interface RegisterInput {
  fullName: string;
  phone: string;
  nickname: string;
  password: string;
}

export async function registerUser(input: RegisterInput): Promise<User> {
  const users = readUsers();

  if (users.some((u) => u.phone === input.phone)) {
    throw new UserServiceError("Ya existe una cuenta con ese teléfono.");
  }
  if (users.some((u) => u.nickname.toLowerCase() === input.nickname.toLowerCase())) {
    throw new UserServiceError("Ese nickname ya está en uso.");
  }

  const user: StoredUser = {
    id: makeId(),
    fullName: input.fullName.trim(),
    phone: input.phone,
    nickname: input.nickname.trim(),
    balance: DEMO_BALANCE,
    puntos: 0,
    rol: "user",
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(input.password),
  };

  writeUsers([...users, user]);
  return toPublicUser(user);
}

export interface LoginInput {
  /** Teléfono (9 dígitos) o nickname — el usuario puede ingresar con cualquiera de los dos. */
  identifier: string;
  password: string;
}

export async function loginUser(input: LoginInput): Promise<User> {
  const users = readUsers();
  const identifier = input.identifier.trim().toLowerCase();
  const user = users.find(
    (u) => u.phone === identifier || u.nickname.toLowerCase() === identifier
  );
  if (!user) {
    throw new UserServiceError("No encontramos una cuenta con esos datos.");
  }

  const passwordHash = await hashPassword(input.password);
  if (passwordHash !== user.passwordHash) {
    throw new UserServiceError("Contraseña incorrecta.");
  }

  return toPublicUser(user);
}

export interface LoginBakeryInput {
  email: string;
  password: string;
}

/**
 * Login de /bakery contra Supabase Auth real (no el mock de arriba) — usa
 * la tabla `perfiles` del motor `/exchange` como fuente de rol/saldo, y
 * mapea la fila al mismo shape `User` que consume el resto de la UI de
 * panadería (RequireAdmin, Header, /bakery/recargas…) para no duplicar
 * esas pantallas.
 */
export async function loginWithSupabase(input: LoginBakeryInput): Promise<User> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error || !data.user) {
    throw new UserServiceError("No pudimos iniciar sesión con esas credenciales.");
  }

  const { data: perfil, error: perfilError } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", data.user.id)
    .single();
  if (perfilError || !perfil) {
    throw new UserServiceError("Tu cuenta no tiene un perfil asociado en la panadería.");
  }

  return {
    id: perfil.id,
    fullName: perfil.nickname,
    phone: "",
    nickname: perfil.nickname,
    balance: perfil.saldo_disponible,
    puntos: 0,
    rol: perfil.rol,
    createdAt: perfil.created_at,
  };
}

/** Vuelve a leer la cuenta desde el store para reflejar cambios hechos por
 * otra pantalla (p.ej. saldo aprobado o puntos ganados). */
export async function getUserById(userId: string): Promise<User | null> {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  return user ? toPublicUser(user) : null;
}

export async function creditBalance(userId: string, monto: number): Promise<User> {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) throw new UserServiceError("Usuario no encontrado.");

  users[index] = { ...users[index], balance: users[index].balance + monto };
  writeUsers(users);
  return toPublicUser(users[index]);
}

export async function awardPoints(userId: string, puntos: number): Promise<User | null> {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return null;

  users[index] = { ...users[index], puntos: users[index].puntos + puntos };
  writeUsers(users);
  return toPublicUser(users[index]);
}

/** Ranking de "panaderos más gosus": todos los usuarios, ordenados por puntos desc. */
export async function listUsersRanking(): Promise<User[]> {
  const users = readUsers();
  return users
    .filter((u) => u.rol === "user")
    .map(toPublicUser)
    .sort((a, b) => b.puntos - a.puntos);
}
