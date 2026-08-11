"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Match } from "@/types";
import { getCierraEn, isMatchOpen } from "@/services/betService";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Cuenta regresiva hasta el cierre de un título. Solo pinta el tiempo
 * después de montar en el cliente (arranca en null) para que el primer
 * render de servidor y el de cliente coincidan y no haya warnings de
 * hidratación por un valor que depende de "ahora".
 */
export function CountdownBadge({ match }: { match: Match }) {
  const [label, setLabel] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (match.estado !== "abierto") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- static label for a closed/resolved match, not a ticking value
      setLabel(match.estado === "cerrado" ? "Cerrado" : "Resuelto");
      setOpen(false);
      return;
    }

    const cierraEn = getCierraEn(match);
    const tick = () => {
      const remaining = cierraEn.getTime() - Date.now();
      const stillOpen = isMatchOpen(match);
      setOpen(stillOpen);
      setLabel(stillOpen ? formatRemaining(remaining) : "Cerrado");
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [match]);

  return (
    <span
      className={clsx(
        "rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums tracking-wide",
        open
          ? "border-gold-dark/60 text-parchment/60"
          : "border-lose/60 text-lose-glow"
      )}
      aria-live="off"
    >
      {open ? "Cierra en " : ""}
      {label ?? "—:—"}
    </span>
  );
}
