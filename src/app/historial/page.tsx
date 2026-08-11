"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { TeamCrest } from "@/components/TeamCrest";
import { useMatches } from "@/context/MatchesContext";
import { useSession } from "@/context/SessionContext";
import { getUserBets } from "@/services/betService";

function HistorialContent() {
  const { user } = useSession();
  const { matches } = useMatches();
  if (!user) return null;

  const { paired } = getUserBets(matches, user.id);
  const ordered = [...paired].sort(
    (a, b) => new Date(b.paired.pairedAt).getTime() - new Date(a.paired.pairedAt).getTime()
  );

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Historial</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Registro de tus duelos 1:1 ya emparejados en LA PANADERÍA DE MASOKU.
        </p>

        {ordered.length === 0 ? (
          <Panel className="mt-8 border-dashed p-6 text-center text-sm text-parchment/50">
            Aún no tienes duelos en tu historial.
          </Panel>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {ordered.map(({ match, paired: duel, userSide }) => (
              <li key={duel.id}>
                <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <TeamCrest team={match.teamA} size={36} />
                    <span className="text-xs text-parchment/40">vs</span>
                    <TeamCrest team={match.teamB} size={36} />
                    <div>
                      <p className="text-sm font-semibold text-parchment">{match.titulo}</p>
                      <p className="text-xs text-parchment/50">
                        {match.time} · {match.format} ·{" "}
                        {new Date(duel.pairedAt).toLocaleDateString("es-PE")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-fantasy text-sm font-bold text-gold-light">
                      Tu lado: {userSide} · S/{duel.amount}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-parchment/40">
                      Duelo emparejado
                    </p>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

export default function HistorialPage() {
  return (
    <RequireAuth>
      <HistorialContent />
    </RequireAuth>
  );
}
