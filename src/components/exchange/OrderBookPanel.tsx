"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { CreateBetForm } from "@/components/exchange/CreateBetForm";
import { Apuesta } from "@/lib/supabase/types";
import { OrderBook } from "@/actions/betting";

const ESTADO_LABEL: Record<Apuesta["estado"], string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  completa: "Completa",
  cancelada: "Cancelada",
};

export function OrderBookPanel({
  eventoId,
  eventoNombre,
  ladoALabel,
  ladoBLabel,
  initialBook,
  initialMisApuestas,
}: {
  eventoId: string;
  eventoNombre: string;
  ladoALabel: string;
  ladoBLabel: string;
  initialBook: OrderBook;
  initialMisApuestas: Apuesta[];
}) {
  const router = useRouter();
  const [book] = useState(initialBook);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel className="p-5">
        <h2 className="font-fantasy text-lg font-semibold text-gold-light">
          Libro de órdenes — {eventoNombre}
        </h2>
        <p className="mt-1 text-xs text-parchment/50">
          Monto pendiente agregado por lado (esperando contraparte).
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <BookSide label={ladoALabel} side={book.lado_a} />
          <BookSide label={ladoBLabel} side={book.lado_b} />
        </div>

        <h3 className="mt-6 mb-2 font-fantasy text-sm font-semibold text-gold-light">
          Mis apuestas en este evento
        </h3>
        {initialMisApuestas.length === 0 ? (
          <p className="rounded-md border border-dashed border-gold-dark/60 px-3 py-4 text-center text-xs text-parchment/50">
            Aún no tienes apuestas aquí.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {initialMisApuestas.map((apuesta) => (
              <li
                key={apuesta.id}
                className="flex items-center justify-between rounded-md border border-gold-dark/50 bg-obsidian/40 px-3 py-2 text-xs"
              >
                <span className="font-semibold text-parchment">
                  Lado {apuesta.lado.toUpperCase()} · S/{apuesta.monto_total}
                </span>
                <span className="text-parchment/60">
                  Matcheado S/{apuesta.monto_matcheado} · Pendiente S/{apuesta.monto_pendiente}
                </span>
                <span className="rounded border border-gold-dark px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold/80">
                  {ESTADO_LABEL[apuesta.estado]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="p-5">
        <h2 className="font-fantasy text-lg font-semibold text-gold-light">
          Nueva apuesta
        </h2>
        <p className="mt-1 mb-4 text-xs text-parchment/50">
          Se empareja FIFO contra órdenes pendientes del lado contrario. Lo
          no emparejado queda en el libro esperando contraparte.
        </p>
        <CreateBetForm
          eventoId={eventoId}
          ladoALabel={ladoALabel}
          ladoBLabel={ladoBLabel}
          onCreated={refresh}
        />
      </Panel>
    </div>
  );
}

function BookSide({
  label,
  side,
}: {
  label: string;
  side: OrderBook["lado_a"];
}) {
  return (
    <div className="rounded-md border border-gold-dark/60 bg-obsidian/40 p-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-parchment/60">
        {label}
      </p>
      <p className="mt-1 font-fantasy text-xl font-bold text-gold-light">
        S/{side.monto_pendiente_total.toFixed(2)}
      </p>
      <p className="text-[11px] text-parchment/40">{side.ordenes} orden(es) pendiente(s)</p>
    </div>
  );
}
