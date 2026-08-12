export type Rol = "user" | "admin";

export interface User {
  id: string;
  fullName: string;
  phone: string; // 9 digits, without +51 prefix
  nickname: string;
  /** Vive en Supabase Auth, no en `perfiles` — lo inyecta SessionContext desde la sesión. */
  email: string;
  balance: number;
  puntos: number;
  rol: Rol;
  createdAt: string;
}

/** Límites por apuesta — los mismos que anuncia el arte del footer
 * ("APUESTA MÍNIMA S/10 · MÁXIMA S/100"). Se validan en el schema Zod
 * (`crearApuestaSchema`) y otra vez en `crear_apuesta` (SQL). */
export const BET_MIN = 10;
export const BET_MAX = 100;
export const DURACION_MIN_DEFAULT = 10;

// ---------------------------------------------------------------------------
// Recargas (top-up con comprobante de imagen)
// ---------------------------------------------------------------------------

export type RecargaEstado = "pendiente" | "aprobada" | "rechazada";

export interface Recarga {
  id: string;
  userId: string;
  userNickname: string;
  monto: number;
  /** Comprobante de depósito, como data URL (imagen comprimida en el cliente). */
  imagenDataUrl: string;
  estado: RecargaEstado;
  createdAt: string;
  revisadoPor?: string;
  revisadoAt?: string;
}

// ---------------------------------------------------------------------------
// Niveles ("panaderos más gosus")
// ---------------------------------------------------------------------------

export const PUNTOS_POR_GANAR = 5;
export const PUNTOS_POR_PERDER = 1;

export interface Level {
  id: number;
  nombre: string;
  min: number;
  max: number | null;
}
