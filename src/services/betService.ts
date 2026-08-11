import {
  BET_MAX,
  BET_MIN,
  Bet,
  BetSide,
  Match,
  PairedBet,
  PUNTOS_POR_GANAR,
  PUNTOS_POR_PERDER,
  PendingChallenge,
} from "@/types";

export class BetServiceError extends Error {}

/** Instante en que se cierra un título de apuesta: creadoEn + duracionMin. */
export function getCierraEn(match: Match): Date {
  return new Date(new Date(match.creadoEn).getTime() + match.duracionMin * 60_000);
}

/** Un título solo acepta retos/aceptaciones mientras esté 'abierto' y su
 * contador no haya vencido. El vencimiento se evalúa en el momento (no
 * requiere que nadie "cierre" el título a mano). */
export function isMatchOpen(match: Match, now: Date = new Date()): boolean {
  return match.estado === "abierto" && now < getCierraEn(match);
}

/** Returns the opposite side of a 1:1 bet. GANA <-> PIERDE. */
export function getOppositeSide(side: BetSide): BetSide {
  return side === "GANA" ? "PIERDE" : "GANA";
}

/** Validates that an amount respects the S/10–S/100 range required by every 1:1 bet. */
export function validateAmount(amount: number): { valid: boolean; message?: string } {
  if (Number.isNaN(amount) || !Number.isFinite(amount)) {
    return { valid: false, message: "Ingresa un monto válido." };
  }
  if (!Number.isInteger(amount)) {
    return { valid: false, message: "El monto debe ser un número entero." };
  }
  if (amount < BET_MIN) {
    return { valid: false, message: `El monto mínimo es S/${BET_MIN}.` };
  }
  if (amount > BET_MAX) {
    return { valid: false, message: `El monto máximo es S/${BET_MAX}.` };
  }
  return { valid: true };
}

/** A user may never accept the challenge they themselves created. */
export function isOwnChallenge(userId: string, creatorUserId: string): boolean {
  return userId === creatorUserId;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Creates a new open challenge on a match that has no active duel yet.
 * The creator picks GANA or PIERDE and an amount between S/10 and S/100.
 */
export function createChallenge(
  match: Match,
  user: { id: string; nickname: string },
  side: BetSide,
  amount: number
): PendingChallenge {
  if (!isMatchOpen(match)) {
    throw new BetServiceError("Este título ya cerró — no se aceptan más apuestas.");
  }
  if (match.duel !== null) {
    throw new BetServiceError("Esta partida ya tiene un duelo activo.");
  }
  const validation = validateAmount(amount);
  if (!validation.valid) {
    throw new BetServiceError(validation.message);
  }

  const creatorBet: Bet = {
    id: makeId("bet"),
    matchId: match.id,
    userId: user.id,
    userNickname: user.nickname,
    side,
    amount,
    createdAt: new Date().toISOString(),
  };

  return {
    status: "pending",
    id: makeId("duel"),
    matchId: match.id,
    amount,
    side,
    creatorBet,
  };
}

/**
 * Accepts an existing open challenge. The acceptor is always forced onto the
 * opposite side of the creator, for the exact same amount — no exceptions.
 */
export function acceptChallenge(
  match: Match,
  user: { id: string; nickname: string }
): PairedBet {
  if (!isMatchOpen(match)) {
    throw new BetServiceError("Este título ya cerró — no se aceptan más apuestas.");
  }
  const duel = match.duel;
  if (!duel || duel.status !== "pending") {
    throw new BetServiceError("Esta partida no tiene un reto disponible para tomar.");
  }
  if (isOwnChallenge(user.id, duel.creatorBet.userId)) {
    throw new BetServiceError("No puedes tomar tu propio reto.");
  }

  const opponentSide = getOppositeSide(duel.side);
  const opponentBet: Bet = {
    id: makeId("bet"),
    matchId: match.id,
    userId: user.id,
    userNickname: user.nickname,
    side: opponentSide,
    amount: duel.amount,
    createdAt: new Date().toISOString(),
  };

  return pairBets(duel.creatorBet, opponentBet);
}

/**
 * Pairs two opposite-side, same-amount bets into a locked 1:1 duel.
 * Throws if the invariant (opposite sides, identical amount) is violated —
 * this is the single choke point that guarantees no same-side pairing ever happens.
 */
export function pairBets(betA: Bet, betB: Bet): PairedBet {
  if (betA.matchId !== betB.matchId) {
    throw new BetServiceError("Las apuestas pertenecen a partidas distintas.");
  }
  if (betA.side === betB.side) {
    throw new BetServiceError("Dos jugadores no pueden apostar al mismo lado.");
  }
  if (betA.amount !== betB.amount) {
    throw new BetServiceError("Ambas apuestas deben tener el mismo monto.");
  }
  if (betA.userId === betB.userId) {
    throw new BetServiceError("Un jugador no puede emparejarse consigo mismo.");
  }

  const ganaBet = betA.side === "GANA" ? betA : betB;
  const pierdeBet = betA.side === "PIERDE" ? betA : betB;

  return {
    status: "paired",
    id: makeId("paired"),
    matchId: betA.matchId,
    amount: betA.amount,
    ganaBet,
    pierdeBet,
    pairedAt: new Date().toISOString(),
  };
}

export interface PuntosAward {
  userId: string;
  userNickname: string;
  side: BetSide;
  puntos: number;
}

/**
 * Declara el resultado de un título ya emparejado 1:1 y calcula los puntos:
 * quien apostó al lado ganador (haya elegido GANA o PIERDE) recibe
 * PUNTOS_POR_GANAR; el otro lado recibe igual PUNTOS_POR_PERDER (nunca 0 —
 * participar en un duelo emparejado siempre puntúa). Un título sin duelo
 * emparejado no reparte puntos: nunca hubo rival.
 */
export function resolveMatch(
  match: Match,
  resultado: BetSide
): { match: Match; awards: PuntosAward[] } {
  if (match.estado === "resuelto") {
    throw new BetServiceError("Este título ya fue resuelto.");
  }

  const resolvedMatch: Match = { ...match, estado: "resuelto", resultado };

  const duel = match.duel;
  if (!duel || duel.status !== "paired") {
    return { match: resolvedMatch, awards: [] };
  }

  const awards: PuntosAward[] = [
    {
      userId: duel.ganaBet.userId,
      userNickname: duel.ganaBet.userNickname,
      side: "GANA",
      puntos: resultado === "GANA" ? PUNTOS_POR_GANAR : PUNTOS_POR_PERDER,
    },
    {
      userId: duel.pierdeBet.userId,
      userNickname: duel.pierdeBet.userNickname,
      side: "PIERDE",
      puntos: resultado === "PIERDE" ? PUNTOS_POR_GANAR : PUNTOS_POR_PERDER,
    },
  ];

  return { match: resolvedMatch, awards };
}

/** Returns every bet (as creator or acceptor) placed by a given user across all matches. */
export function getUserBets(matches: Match[], userId: string) {
  const openCreated: { match: Match; challenge: PendingChallenge }[] = [];
  const paired: { match: Match; paired: PairedBet; userSide: BetSide }[] = [];

  for (const match of matches) {
    const duel = match.duel;
    if (!duel) continue;
    if (duel.status === "pending" && duel.creatorBet.userId === userId) {
      openCreated.push({ match, challenge: duel });
    }
    if (duel.status === "paired") {
      if (duel.ganaBet.userId === userId) {
        paired.push({ match, paired: duel, userSide: "GANA" });
      } else if (duel.pierdeBet.userId === userId) {
        paired.push({ match, paired: duel, userSide: "PIERDE" });
      }
    }
  }

  return { openCreated, paired };
}
