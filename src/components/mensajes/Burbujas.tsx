"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { MensajeSoporte } from "@/lib/supabase/types";

/**
 * El hilo de mensajes, en burbujas.
 *
 * Lo comparten el jugador y el staff: la única diferencia es de qué lado cae
 * cada burbuja, y eso lo decide `soyStaff` comparándolo con `de_staff`. Así
 * los dos ven la misma conversación con sus propios mensajes a la derecha.
 */

function hora(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Burbujas({
  mensajes,
  soyStaff,
  vacio,
}: {
  mensajes: MensajeSoporte[] | null;
  soyStaff: boolean;
  vacio: string;
}) {
  const finRef = useRef<HTMLDivElement>(null);
  const cantidad = mensajes?.length ?? 0;

  // Bajar al último mensaje cuando llega uno nuevo. Solo depende de la
  // cantidad: si dependiera del array entero, cada refresco del poll
  // arrastraría la vista aunque no hubiera nada nuevo que leer.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [cantidad]);

  return (
    <div className="flex h-[26rem] flex-col gap-3 overflow-y-auto p-4">
      {mensajes === null ? (
        <p className="m-auto text-sm text-parchment/50">Cargando…</p>
      ) : mensajes.length === 0 ? (
        <p className="m-auto max-w-sm text-center text-sm text-parchment/45">{vacio}</p>
      ) : (
        mensajes.map((m) => {
          const mio = m.de_staff === soyStaff;
          return (
            <div key={m.id} className={clsx("flex", mio ? "justify-end" : "justify-start")}>
              <div
                className={clsx(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5",
                  mio
                    ? "rounded-br-sm bg-gold/15 text-parchment ring-1 ring-gold/30"
                    : "rounded-bl-sm bg-charcoal-light text-parchment/90 ring-1 ring-gold-dark"
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-parchment/40">
                  {m.de_staff ? "CACHUDOBET" : "Jugador"}
                </p>
                {/* `whitespace-pre-wrap` para respetar los saltos de línea que
                    escribió la persona sin permitir HTML. */}
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {m.cuerpo}
                </p>
                <p className="mt-1 text-right text-[10px] text-parchment/35">
                  {hora(m.created_at)}
                </p>
              </div>
            </div>
          );
        })
      )}
      <div ref={finRef} />
    </div>
  );
}
