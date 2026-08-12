"use client";

import { useEffect, useState } from "react";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { LevelBadge } from "@/components/LevelBadge";
import { useSession } from "@/context/SessionContext";
import { listUsersRanking } from "@/services/userService";
import { User } from "@/types";
import clsx from "clsx";

function RankingContent() {
  const { user } = useSession();
  const [ranking, setRanking] = useState<User[] | null>(null);

  useEffect(() => {
    listUsersRanking().then(setRanking);
  }, []);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">
          Ranking de panaderos
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          Los panaderos más gosus de LA PANADERÍA DE MASOKU — gana un duelo emparejado y
          suman {" "}
          <span className="font-semibold text-win-glow">5 puntos</span>; si
          pierdes, igual sumas{" "}
          <span className="font-semibold text-gold-light">1 punto</span>.
        </p>

        {ranking === null ? (
          <Panel className="mt-8 p-6 text-center text-sm text-parchment/50">
            Cargando ranking…
          </Panel>
        ) : ranking.length === 0 ? (
          <Panel className="mt-8 border-dashed p-6 text-center text-sm text-parchment/50">
            Todavía no hay panaderos con puntos.
          </Panel>
        ) : (
          <ol className="mt-8 flex flex-col gap-2">
            {ranking.map((ranked, index) => (
              <li key={ranked.id}>
                <Panel
                  className={clsx(
                    "flex items-center justify-between gap-3 p-4",
                    ranked.id === user?.id && "border-gold-light"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold-dark font-fantasy text-sm font-bold text-gold-light">
                      {index + 1}
                    </span>
                    <span className="font-semibold text-parchment">
                      {ranked.nickname}
                      {ranked.id === user?.id ? (
                        <span className="ml-2 text-xs text-gold/70">(tú)</span>
                      ) : null}
                    </span>
                  </div>
                  <LevelBadge puntos={ranked.puntos} />
                </Panel>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  );
}

export default function RankingPage() {
  return (
    <RequirePlayer>
      <RankingContent />
    </RequirePlayer>
  );
}
