"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { useSession } from "@/context/SessionContext";
import {
  ApuestaConEvento,
  cancelarApuesta,
  getMisApuestasConEvento,
} from "@/actions/betting";
import { CategoriaBadge } from "@/components/partidas/CategoriaBadge";
import { ESTADO_APUESTA_LABEL, ladoLabel } from "@/lib/apuestas";

function MisApuestasContent() {
  const { refreshUser } = useSession();
  const { showToast } = useToast();
  const [apuestas, setApuestas] = useState<ApuestaConEvento[] | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await getMisApuestasConEvento();
    if (result.ok) setApuestas(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  async function handleCancelar(apuestaId: string) {
    setCancelando(apuestaId);
    try {
      const result = await cancelarApuesta({ apuestaId });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo cancelar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Monto pendiente cancelado",
        description: "Lo que ya estaba emparejado sigue en juego.",
      });
      await Promise.all([refresh(), refreshUser()]);
    } finally {
      setCancelando(null);
    }
  }

  const activas = (apuestas ?? []).filter(({ evento }) => evento.estado !== "resuelto");

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Mis apuestas</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Tus apuestas en títulos todavía sin resultado. Puedes cancelar solo
          la parte que aún no se emparejó — lo ya emparejado sigue en juego.
        </p>

        <section className="mt-8">
          {apuestas === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : activas.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              No tienes apuestas activas.
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {activas.map(({ apuesta, evento }) => (
                <Panel key={apuesta.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-parchment">{evento.nombre}</p>
                      <p className="mt-0.5 text-xs text-parchment/50">
                        Tu lado:{" "}
                        <span
                          className={clsx(
                            "font-semibold",
                            apuesta.lado === "a" ? "text-win-glow" : "text-lose-glow"
                          )}
                        >
                          {ladoLabel(evento, apuesta.lado)}
                        </span>
                      </p>
                    </div>
                    <CategoriaBadge categoria={evento.categoria} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Dato label="Apostaste" valor={`S/${apuesta.monto_total}`} />
                    <Dato
                      label="Emparejado"
                      valor={`S/${apuesta.monto_matcheado}`}
                      destacado={Number(apuesta.monto_matcheado) > 0}
                    />
                    <Dato label="Sin cubrir" valor={`S/${apuesta.monto_pendiente}`} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-gold/70">
                      {ESTADO_APUESTA_LABEL[apuesta.estado]}
                    </span>
                    {Number(apuesta.monto_pendiente) > 0 && evento.estado === "abierto" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={cancelando === apuesta.id}
                        onClick={() => handleCancelar(apuesta.id)}
                        className="min-h-9 px-3 py-1 text-xs"
                      >
                        {cancelando === apuesta.id
                          ? "Cancelando…"
                          : `Cancelar S/${apuesta.monto_pendiente} sin cubrir`}
                      </Button>
                    ) : null}
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

function Dato({
  label,
  valor,
  destacado = false,
}: {
  label: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className="rounded-md border border-gold-dark/40 bg-obsidian/40 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-parchment/40">{label}</p>
      <p
        className={clsx(
          "font-fantasy text-sm font-bold",
          destacado ? "text-gold-light" : "text-parchment/80"
        )}
      >
        {valor}
      </p>
    </div>
  );
}

export default function MisApuestasPage() {
  return (
    <RequirePlayer>
      <MisApuestasContent />
    </RequirePlayer>
  );
}
