import Link from "next/link";
import { BET_MAX, BET_MIN } from "@/types";
import { CUOTA } from "@/lib/apuestas";

/**
 * Los pasos del hero. Antes era `hoy-se-hornea.png`, un cartel dibujado con
 * el texto adentro: no se podía leer con lector de pantalla, no se podía
 * traducir y cambiar una cifra obligaba a reexportar la imagen. Ahora es
 * texto, y los números salen de las mismas constantes que valida el motor.
 */

const PASOS = [
  {
    titulo: "Elige tu lado",
    detalle: `Entra a una sala abierta y apuesta entre S/${BET_MIN} y S/${BET_MAX}.`,
  },
  {
    titulo: "Encuentra rival",
    detalle:
      "Tu monto se cubre por partes con lo que pongan del lado contrario. Lo que nadie cubra vuelve a tu saldo.",
  },
  {
    titulo: "Cobra",
    detalle: `Si ganas, lo emparejado paga ${CUOTA}x directo a tu saldo.`,
  },
];

export function GameRulesSidebar() {
  return (
    <div className="w-full max-w-md lg:max-w-none">
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.3em] text-gold">
        Cómo funciona
      </p>

      <ol className="mt-4 space-y-4">
        {PASOS.map((paso, i) => (
          <li key={paso.titulo} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gold font-display text-xs font-extrabold text-obsidian">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-parchment">{paso.titulo}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-parchment/55">{paso.detalle}</p>
            </div>
          </li>
        ))}
      </ol>

      <Link
        href="/como-jugar"
        className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-gold underline-offset-4 transition hover:underline"
      >
        Ver las reglas completas <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
