"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { useMatches } from "@/context/MatchesContext";
import { useSession } from "@/context/SessionContext";
import { getUserBets } from "@/services/betService";
import clsx from "clsx";

function MisApuestasContent() {
  const { user } = useSession();
  const { matches } = useMatches();
  if (!user) return null;

  const { openCreated, paired } = getUserBets(matches, user.id);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Mis apuestas</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Tus retos publicados y tus duelos ya emparejados 1:1. Una vez
          registrada, una apuesta no se puede retirar.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Retos esperando rival
          </h2>
          {openCreated.length === 0 ? (
            <EmptyState text="No tienes retos esperando rival." />
          ) : (
            <div className="flex flex-col gap-3">
              {openCreated.map(({ match, challenge }) => (
                <Panel key={challenge.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-semibold text-parchment">{match.titulo}</p>
                    <p className="text-xs text-parchment/50">{match.time} · {match.format}</p>
                  </div>
                  <span
                    className={clsx(
                      "font-fantasy font-bold",
                      challenge.side === "GANA" ? "text-win-glow" : "text-lose-glow"
                    )}
                  >
                    {challenge.side} · S/{challenge.amount}
                  </span>
                </Panel>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Duelos emparejados
          </h2>
          {paired.length === 0 ? (
            <EmptyState text="Todavía no tienes duelos emparejados 1:1." />
          ) : (
            <div className="flex flex-col gap-3">
              {paired.map(({ match, paired: duel, userSide }) => (
                <Panel key={duel.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-semibold text-parchment">{match.titulo}</p>
                    <p className="text-xs text-parchment/50">{match.time} · {match.format}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={clsx(
                        "font-fantasy font-bold",
                        userSide === "GANA" ? "text-win-glow" : "text-lose-glow"
                      )}
                    >
                      Tu lado: {userSide} · S/{duel.amount}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-gold/70">
                      {match.estado === "resuelto"
                        ? `Resuelto: ${match.resultado} · ${
                            match.resultado === userSide ? "+5 pts" : "+1 pt"
                          }`
                        : "Duelo emparejado 1:1"}
                    </p>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">{text}</Panel>
  );
}

export default function MisApuestasPage() {
  return (
    <RequireAuth>
      <MisApuestasContent />
    </RequireAuth>
  );
}
