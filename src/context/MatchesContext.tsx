"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BetSide, DURACION_MIN_DEFAULT, Match } from "@/types";
import { initialMatches } from "@/data/matches";
import {
  acceptChallenge,
  createChallenge,
  resolveMatch as resolveMatchPure,
} from "@/services/betService";
import { adminOtorgarPuntos } from "@/actions/perfiles";

const MATCHES_KEY = "lapanca:matches";

function makeGenericTeam(id: string, name: string) {
  return {
    id,
    name,
    crest: "generic" as const,
    colorFrom: "#6b0f13",
    colorTo: "#3d0a0d",
  };
}

export interface CreateTituloInput {
  titulo: string;
  nombreEquipoA: string;
  nombreEquipoB: string;
  time: string;
  duracionMin?: number;
}

interface MatchesContextValue {
  matches: Match[];
  publishChallenge: (
    matchId: string,
    user: { id: string; nickname: string },
    side: BetSide,
    amount: number
  ) => void;
  takeChallenge: (
    matchId: string,
    user: { id: string; nickname: string }
  ) => void;
  /** Admin: publica un nuevo título de apuesta para que los usuarios elijan. */
  createTitulo: (input: CreateTituloInput) => void;
  /** Admin: cambia la duración (minutos) hasta el cierre de un título abierto. */
  updateDuracion: (matchId: string, duracionMin: number) => void;
  /** Admin: declara el resultado y reparte puntos (5 al ganador, 1 al perdedor). */
  resolveMatch: (matchId: string, resultado: BetSide) => void;
}

const MatchesContext = createContext<MatchesContextValue | null>(null);

export function MatchesProvider({ children }: { children: React.ReactNode }) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MATCHES_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap from localStorage on mount
      if (raw) setMatches(JSON.parse(raw) as Match[]);
    } catch {
      // ignore corrupted state, keep seed data
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    // Skip until the load-from-storage effect above has run — otherwise
    // this fires first with the hardcoded seed data and clobbers whatever
    // was already persisted (lost títulos/duelos on every fresh reload).
    if (!hydrated) return;
    window.localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
  }, [matches, hydrated]);

  const publishChallenge = useCallback(
    (
      matchId: string,
      user: { id: string; nickname: string },
      side: BetSide,
      amount: number
    ) => {
      setMatches((prev) =>
        prev.map((match) => {
          if (match.id !== matchId) return match;
          const duel = createChallenge(match, user, side, amount);
          return { ...match, duel };
        })
      );
    },
    []
  );

  const takeChallenge = useCallback(
    (matchId: string, user: { id: string; nickname: string }) => {
      setMatches((prev) =>
        prev.map((match) => {
          if (match.id !== matchId) return match;
          const duel = acceptChallenge(match, user);
          return { ...match, duel };
        })
      );
    },
    []
  );

  const createTitulo = useCallback((input: CreateTituloInput) => {
    const id = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nuevo: Match = {
      id,
      titulo: input.titulo,
      teamA: makeGenericTeam(`${id}-a`, input.nombreEquipoA),
      teamB: makeGenericTeam(`${id}-b`, input.nombreEquipoB),
      time: input.time,
      format: "BO3",
      duel: null,
      duracionMin: input.duracionMin ?? DURACION_MIN_DEFAULT,
      creadoEn: new Date().toISOString(),
      estado: "abierto",
    };
    setMatches((prev) => [nuevo, ...prev]);
  }, []);

  const updateDuracion = useCallback((matchId: string, duracionMin: number) => {
    setMatches((prev) =>
      prev.map((match) => (match.id === matchId ? { ...match, duracionMin } : match))
    );
  }, []);

  const resolveMatch = useCallback(
    (matchId: string, resultado: BetSide) => {
      // Side effects (awardPoints writes to the users store) must never
      // live inside the setState updater below — React may invoke that
      // updater more than once (e.g. Strict Mode in dev), which would
      // silently double-award points. Compute the result from the current
      // `matches` state first, then apply the state update and the side
      // effects as two separate, single-shot steps.
      const target = matches.find((match) => match.id === matchId);
      if (!target) return;

      const { match: resolved, awards } = resolveMatchPure(target, resultado);
      setMatches((prev) => prev.map((match) => (match.id === matchId ? resolved : match)));
      awards.forEach((award) => {
        void adminOtorgarPuntos({ usuarioId: award.userId, puntos: award.puntos });
      });
    },
    [matches]
  );

  const value = useMemo(
    () => ({
      matches,
      publishChallenge,
      takeChallenge,
      createTitulo,
      updateDuracion,
      resolveMatch,
    }),
    [matches, publishChallenge, takeChallenge, createTitulo, updateDuracion, resolveMatch]
  );

  return <MatchesContext.Provider value={value}>{children}</MatchesContext.Provider>;
}

export function useMatches() {
  const ctx = useContext(MatchesContext);
  if (!ctx) throw new Error("useMatches debe usarse dentro de MatchesProvider");
  return ctx;
}
