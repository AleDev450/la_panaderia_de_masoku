"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { PistaCarrera } from "@/components/sorteos/PistaCarrera";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { VistaCarrera, correrCarrera, getCarrera } from "@/actions/sorteos";

/**
 * La carrera de un sorteo, lista para meter en cualquier pantalla.
 *
 * Se carga sola (solo recibe el id) para que integrarla sea una línea y no un
 * refactor del estado de la página que la usa — mismo criterio que
 * `HeroRonda`. Con `esAdmin` aparece además el botón de largada.
 *
 * Si la migración 0056 todavía no corrió, no se dibuja nada en vez de romper
 * la pantalla entera del sorteo.
 */

export function CarreraSorteoPanel({
  sorteoId,
  esAdmin = false,
}: {
  sorteoId: string;
  esAdmin?: boolean;
}) {
  const { user } = useSession();
  const { showToast } = useToast();
  const [vista, setVista] = useState<VistaCarrera | null>(null);
  const [desfase, setDesfase] = useState(0);
  const [largando, setLargando] = useState(false);
  const [reducirMovimiento, setReducirMovimiento] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getCarrera(sorteoId);
    if (!result.ok) return;
    setDesfase(new Date(result.data.servidorAhora).getTime() - Date.now());
    setVista(result.data);
  }, [sorteoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    // 2s, no 3: la cuenta regresiva bajó a 3 segundos (0057) y el poll tiene
    // que caber dentro para que todos alcancen a ver el "3, 2, 1".
    const id = setInterval(refresh, 2_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    setReducirMovimiento(mq.matches);
    const escuchar = (e: MediaQueryListEvent) => setReducirMovimiento(e.matches);
    mq.addEventListener("change", escuchar);
    return () => mq.removeEventListener("change", escuchar);
  }, []);

  async function largar() {
    setLargando(true);
    try {
      const result = await correrCarrera(sorteoId);
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo largar", description: result.error });
        return;
      }
      showToast({
        variant: "success",
        title: "¡Largaron!",
        description: "Todos están viendo la misma carrera.",
      });
      await refresh();
    } finally {
      setLargando(false);
    }
  }

  if (!vista) return null;

  const conTickets = vista.inscripciones.filter((i) => i.tickets > 0);
  const quedanPorCorrer = conTickets.filter((i) => !i.ganador).length;

  if (conTickets.length === 0) {
    return esAdmin ? (
      <Panel className="mt-4 border-dashed p-5 text-center text-sm text-parchment/50">
        Nadie tiene tickets todavía. Asígnalos arriba y después larga la carrera.
      </Panel>
    ) : null;
  }

  return (
    <div className="mt-6">
      <PistaCarrera
        inscripciones={vista.inscripciones}
        carrera={vista.carrera}
        desfaseMs={desfase}
        miUsuarioId={user?.id}
        reducirMovimiento={reducirMovimiento}
      />

      {esAdmin ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={largando || quedanPorCorrer === 0}
            onClick={largar}
            className="min-h-12 px-6 text-base"
          >
            {largando
              ? "Largando…"
              : quedanPorCorrer === 0
                ? "Ya ganaron todos"
                : vista.carrera
                  ? "🐎 Iniciar otra carrera"
                  : "🐎 Iniciar carrera"}
          </Button>
          <p className="text-[11px] text-parchment/40">
            {quedanPorCorrer === 0
              ? "No queda nadie con tickets sin haber ganado."
              : `Quedan ${quedanPorCorrer} participante(s) con tickets. Cada carrera saca un ganador más — uno por cofre.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
