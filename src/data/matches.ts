import { DURACION_MIN_DEFAULT, Match } from "@/types";
import { teams } from "./teams";

// `creadoEn` se fija al cargar el módulo para que el contador de cierre
// arranque desde "ahora" en cada demo nueva. CountdownBadge solo pinta el
// tiempo restante después de montar en el cliente, así que esta pequeña
// diferencia entre el render de servidor y el de cliente no genera
// mismatches de hidratación visibles.
const seedCreadoEn = new Date().toISOString();

export const initialMatches: Match[] = [
  {
    id: "match-1",
    titulo: "¿Crimson Forge gana la serie?",
    teamA: teams["crimson-forge"],
    teamB: teams["lunar-wardens"],
    time: "14:00",
    format: "BO3",
    duracionMin: DURACION_MIN_DEFAULT,
    creadoEn: seedCreadoEn,
    estado: "abierto",
    duel: {
      status: "pending",
      id: "duel-1",
      matchId: "match-1",
      amount: 40,
      side: "GANA",
      creatorBet: {
        id: "bet-1",
        matchId: "match-1",
        userId: "seed-panconqueso",
        userNickname: "PanConQueso",
        side: "GANA",
        amount: 40,
        createdAt: "2026-08-11T09:00:00.000Z",
      },
    },
  },
  {
    id: "match-2",
    titulo: "¿Titan Bakers gana la serie?",
    teamA: teams["titan-bakers"],
    teamB: teams["frost-ravens"],
    time: "17:30",
    format: "BO3",
    duracionMin: DURACION_MIN_DEFAULT,
    creadoEn: seedCreadoEn,
    estado: "abierto",
    duel: {
      status: "pending",
      id: "duel-2",
      matchId: "match-2",
      amount: 25,
      side: "GANA",
      creatorBet: {
        id: "bet-2",
        matchId: "match-2",
        userId: "seed-hornoferoz",
        userNickname: "HornoFeroz",
        side: "GANA",
        amount: 25,
        createdAt: "2026-08-11T10:15:00.000Z",
      },
    },
  },
  {
    id: "match-3",
    titulo: "¿Verdant Stags gana la serie?",
    teamA: teams["verdant-stags"],
    teamB: teams["void-seekers"],
    time: "21:00",
    format: "BO3",
    duracionMin: DURACION_MIN_DEFAULT,
    creadoEn: seedCreadoEn,
    estado: "abierto",
    duel: null,
  },
];
