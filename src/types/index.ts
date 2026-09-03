export type Rol = "user" | "admin";

export interface User {
  id: string;
  fullName: string;
  phone: string; // 9 digits, without +51 prefix
  nickname: string;
  /** Vive en Supabase Auth, no en `perfiles` — lo inyecta SessionContext desde la sesión. */
  email: string;
  /** Saldo REAL DISPONIBLE (`perfiles.saldo_disponible`): lo único que se
   * puede retirar, y lo único que NO está comprometido en una apuesta. */
  balance: number;
  /** Real apartado en apuestas vivas (`saldo_retenido`). No se perdió: vuelve
   * al disponible si nadie lo cubre, o se paga 1.80 si gana. */
  balanceRetenido: number;
  /** Saldo fake (`perfiles.saldo_fake`, 0036). Se puede apostar pero no
   * retirar. Va aparte de `balance` para que /retirar no ofrezca plata que
   * el motor va a rechazar — ver src/lib/saldo.ts. */
  balanceFake: number;
  /** Fake apartado en apuestas vivas (`saldo_fake_retenido`). */
  balanceFakeRetenido: number;
  puntos: number;
  rol: Rol;
  createdAt: string;
}

/**
 * Límites por apuesta, iguales para cualquier categoría. Se validan en Zod
 * y OTRA VEZ en `crear_apuesta` (SQL, 0047_minimo_universal_5.sql) — el SQL
 * es el que manda; si cambias uno, cambia el otro.
 *
 * (Antes de 0045/0047 esta constante decía 5 y el SQL exigía 10: la UI
 * prometía un mínimo que el motor rechazaba. 0045 arregló solo blackjack;
 * 0047 lo unificó para todo.)
 */
export const BET_MIN = 5;
export const BET_MAX = 100;
export const DURACION_MIN_DEFAULT = 10;

// ---------------------------------------------------------------------------
// Rangos ("los más cachudos")
// ---------------------------------------------------------------------------

/** Debe coincidir con `liquidar_evento` (0018_puntos_ganar_3.sql). */
export const PUNTOS_POR_GANAR = 3;
export const PUNTOS_POR_PERDER = 1;

export interface Level {
  id: number;
  nombre: string;
  min: number;
  max: number | null;
  /** Color del rango, en hex. Se aplica al isotipo de la insignia — desde
   * el rebrand la insignia se dibuja, ya no es un PNG por nivel. */
  color: string;
}
