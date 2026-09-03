"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Evento } from "@/lib/supabase/types";
import { VENTANA_CORRECCION_MS } from "@/lib/eventos";

/**
 * Declarar un ganador ya no paga: guarda el resultado y abre una ventana
 * de corrección. Esta es la UI de esas tres fases — declarar, corregir
 * (una sola vez) y confirmar el pago. Ver 0013_resolucion_en_dos_fases.sql.
 */
export function ResolverPanel({
  evento,
  procesando,
  onDeclarar,
  onCorregir,
  onConfirmar,
  onVentanaVencida,
}: {
  evento: Evento;
  procesando: boolean;
  onDeclarar: (resultado: "a" | "b") => void;
  onCorregir: (resultado: "a" | "b") => void;
  onConfirmar: () => void;
  /** Se dispara al llegar a 0 para que el panel liquide lo vencido. */
  onVentanaVencida: () => void;
}) {
  const declarado = evento.resultado_preliminar !== null;

  if (evento.estado === "cancelado") {
    return (
      <p className="mt-3 rounded-md border border-lose/50 bg-lose/5 px-3 py-2 text-xs text-parchment/60">
        Cancelado — se devolvió el dinero a todos los apostadores.
        {evento.cancelado_motivo ? ` Motivo: ${evento.cancelado_motivo}` : ""}
      </p>
    );
  }

  if (evento.estado === "resuelto") {
    return (
      <p className="mt-3 rounded-md border border-gold-dark/60 bg-obsidian/40 px-3 py-2 text-xs text-parchment/60">
        Resultado:{" "}
        <span className="font-display font-bold text-gold-light">
          {evento.resultado === "a" ? evento.lado_a : evento.lado_b}
        </span>{" "}
        · pagado
      </p>
    );
  }

  if (!declarado) {
    return (
      <div className="mt-3">
        <p className="mb-2 text-xs text-parchment/50">
          Declarar el ganador <strong className="text-parchment/70">no paga todavía</strong>:
          tendrás 1 minuto para corregirlo antes de confirmar.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="win"
            disabled={procesando}
            onClick={() => onDeclarar("a")}
          >
            Ganó {evento.lado_a}
          </Button>
          <Button
            type="button"
            variant="lose"
            disabled={procesando}
            onClick={() => onDeclarar("b")}
          >
            Ganó {evento.lado_b}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ConfirmacionPendiente
      evento={evento}
      procesando={procesando}
      onCorregir={onCorregir}
      onConfirmar={onConfirmar}
      onVentanaVencida={onVentanaVencida}
    />
  );
}

function ConfirmacionPendiente({
  evento,
  procesando,
  onCorregir,
  onConfirmar,
  onVentanaVencida,
}: {
  evento: Evento;
  procesando: boolean;
  onCorregir: (resultado: "a" | "b") => void;
  onConfirmar: () => void;
  onVentanaVencida: () => void;
}) {
  const vence = evento.declarado_at
    ? new Date(evento.declarado_at).getTime() + VENTANA_CORRECCION_MS
    : 0;

  const [restanteMs, setRestanteMs] = useState(() => Math.max(0, vence - Date.now()));

  useEffect(() => {
    if (restanteMs <= 0) return;
    const id = setInterval(() => {
      const queda = Math.max(0, vence - Date.now());
      setRestanteMs(queda);
      if (queda === 0) onVentanaVencida();
    }, 1000);
    return () => clearInterval(id);
    // `restanteMs` fuera de deps a propósito: el intervalo ya lo actualiza,
    // incluirlo lo recrearía cada segundo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vence, onVentanaVencida]);

  const ganador = evento.resultado_preliminar === "a" ? evento.lado_a : evento.lado_b;
  const otro = evento.resultado_preliminar === "a" ? evento.lado_b : evento.lado_a;
  const otroLado: "a" | "b" = evento.resultado_preliminar === "a" ? "b" : "a";

  const puedeCorregir = evento.correcciones < 1 && restanteMs > 0;
  const segundos = Math.ceil(restanteMs / 1000);

  return (
    <div className="mt-3 rounded-md border border-gold-light/50 bg-gold/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-parchment/80">
          Declarado ganador:{" "}
          <span className="font-display font-bold text-gold-light">{ganador}</span>
        </p>
        <span
          className={clsx(
            "rounded-md border px-2 py-1 font-display text-xs font-bold",
            restanteMs > 0
              ? "border-gold-dark text-gold-light"
              : "border-lose/60 text-lose-glow"
          )}
        >
          {restanteMs > 0 ? `Corregible ${segundos}s` : "Ventana cerrada"}
        </span>
      </div>

      <p className="mt-2 text-xs text-parchment/50">
        {evento.correcciones >= 1
          ? "Ya usaste la única corrección. Solo queda confirmar el pago."
          : restanteMs > 0
            ? "Todavía no se pagó nada. Si te equivocaste, corrígelo ahora — solo se puede una vez."
            : "Se acabó el plazo para corregir. Al confirmar se reparte el dinero."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={procesando} onClick={onConfirmar}>
          {procesando ? "Pagando…" : `Confirmar y pagar a ${ganador}`}
        </Button>
        {puedeCorregir ? (
          <Button
            type="button"
            variant="ghost"
            disabled={procesando}
            onClick={() => onCorregir(otroLado)}
          >
            No, ganó {otro}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
