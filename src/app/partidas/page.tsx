"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { MatchCard } from "@/components/matches/MatchCard";
import { BetModal } from "@/components/matches/BetModal";
import { useMatches } from "@/context/MatchesContext";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { BetSide } from "@/types";
import { BetServiceError } from "@/services/betService";

function PartidasContent() {
  const { user } = useSession();
  const { matches, publishChallenge, takeChallenge } = useMatches();
  const { showToast } = useToast();
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);

  const openMatch = matches.find((m) => m.id === openMatchId) ?? null;

  function handlePublish(side: BetSide, amount: number) {
    if (!user || !openMatch) return;
    try {
      publishChallenge(openMatch.id, { id: user.id, nickname: user.nickname }, side, amount);
      showToast({
        variant: "info",
        title: "Reto publicado",
        description: `Tu apuesta ${side} · S/${amount} está esperando rival.`,
      });
      setOpenMatchId(null);
    } catch (err) {
      showToast({
        variant: "warning",
        title: "No se pudo publicar el reto",
        description: err instanceof BetServiceError ? err.message : undefined,
      });
    }
  }

  function handleAccept() {
    if (!user || !openMatch) return;
    try {
      takeChallenge(openMatch.id, { id: user.id, nickname: user.nickname });
      showToast({
        variant: "success",
        title: "Duelo emparejado 1:1",
        description: "Tu apuesta quedó confirmada contra tu rival.",
      });
      setOpenMatchId(null);
    } catch (err) {
      showToast({
        variant: "warning",
        title: "No se pudo tomar el reto",
        description: err instanceof BetServiceError ? err.message : undefined,
      });
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="text-center">
          <h1 className="font-fantasy text-3xl font-bold tracking-wide text-parchment sm:text-4xl">
            Partidas de hoy
          </h1>
          <p className="mt-2 font-fantasy text-sm font-semibold uppercase tracking-[0.25em] text-gold-light">
            Apuestas 1 contra 1
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm text-parchment/60">
            Encuentra una apuesta abierta o crea tu propio reto.
          </p>
          <div className="mx-auto mt-4 inline-block rounded-md border border-gold-dark px-4 py-1.5 font-fantasy text-xs font-semibold tracking-wide text-gold/90">
            Una apuesta. Un rival.
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} onOpen={setOpenMatchId} />
          ))}
        </div>

        <div className="mt-3 text-center text-xs text-parchment/40">18+ · Juego responsable</div>
      </main>

      {openMatch ? (
        <BetModal
          match={openMatch}
          onClose={() => setOpenMatchId(null)}
          onPublish={handlePublish}
          onAccept={handleAccept}
        />
      ) : null}
    </>
  );
}

export default function PartidasPage() {
  return (
    <RequireAuth>
      <PartidasContent />
    </RequireAuth>
  );
}
