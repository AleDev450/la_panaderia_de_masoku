export type Rol = "user" | "admin";

export interface User {
  id: string;
  fullName: string;
  phone: string; // 9 digits, without +51 prefix
  nickname: string;
  balance: number;
  puntos: number;
  rol: Rol;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  crest: TeamCrest;
  colorFrom: string;
  colorTo: string;
}

/** Original, non-licensed crest identifiers rendered as inline SVG icons. */
export type TeamCrest =
  | "forge"
  | "moon"
  | "bakers"
  | "raven"
  | "stag"
  | "eye"
  | "generic";

export type BetSide = "GANA" | "PIERDE";

export interface Bet {
  id: string;
  matchId: string;
  userId: string;
  userNickname: string;
  side: BetSide;
  amount: number;
  createdAt: string;
}

export interface PendingChallenge {
  status: "pending";
  id: string;
  matchId: string;
  amount: number;
  side: BetSide;
  creatorBet: Bet;
}

export interface PairedBet {
  status: "paired";
  id: string;
  matchId: string;
  amount: number;
  ganaBet: Bet;
  pierdeBet: Bet;
  pairedAt: string;
}

export type Duel = PendingChallenge | PairedBet;

export type MatchFormat = "BO3";

/** Lifecycle of a título de apuesta: abierto acepta retos, cerrado ya no
 * (por vencimiento del contador), resuelto ya tiene resultado declarado. */
export type MatchEstado = "abierto" | "cerrado" | "resuelto";

export interface Match {
  id: string;
  /** Título de la apuesta, definido por un admin (p.ej. "¿Crimson Forge gana la serie?"). */
  titulo: string;
  teamA: Team;
  teamB: Team;
  time: string;
  format: MatchFormat;
  duel: Duel | null;
  /** Minutos desde `creadoEn` hasta que se cierra el título (default 10, editable por admin). */
  duracionMin: number;
  creadoEn: string;
  estado: MatchEstado;
  /** GANA => teamA ganó la serie; PIERDE => teamA la perdió. Solo si estado === 'resuelto'. */
  resultado?: BetSide;
}

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
