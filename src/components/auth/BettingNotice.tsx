import { BET_MAX, BET_MIN, BET_MIN_BLACKJACK } from "@/types";

/**
 * Franja de confianza + aviso legal del pie del inicio.
 *
 * Antes era `aviso-apuestas.png`, con los montos DIBUJADOS en la imagen —
 * el comentario de `BET_MIN` en src/types avisaba que cambiar la constante
 * no actualizaba el arte. Ahora los números salen de las constantes, así
 * que no pueden desincronizarse.
 */

const GARANTIAS = [
  { titulo: "Pagos rápidos", detalle: "Yape directo a tu número", icono: "⚡" },
  { titulo: "Uno contra uno", detalle: "Juegas contra otro jugador", icono: "🎯" },
  { titulo: "Sin casa que juegue", detalle: "La plataforma no apuesta", icono: "🛡" },
  { titulo: "Juega seguro", detalle: "18+ · Juego responsable", icono: "🔒" },
];

export function BettingNotice() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gold-dark bg-gold-dark lg:grid-cols-4">
        {GARANTIAS.map((g) => (
          <div
            key={g.titulo}
            className="flex items-center gap-3 bg-charcoal px-4 py-3.5 transition hover:bg-charcoal-light"
          >
            <span aria-hidden className="text-lg text-gold">
              {g.icono}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-xs font-bold uppercase tracking-wide text-parchment">
                {g.titulo}
              </p>
              <p className="truncate text-[11px] text-parchment/45">{g.detalle}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-parchment/40">
        Apuesta mínima S/{BET_MIN} (S/{BET_MIN_BLACKJACK} en blackjack) · máxima
        S/{BET_MAX}. Solo para mayores de 18 años — juega con responsabilidad.
      </p>
    </div>
  );
}
