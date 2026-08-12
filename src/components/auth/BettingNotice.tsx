import Image from "next/image";
import { BET_MAX, BET_MIN } from "@/types";

/**
 * Aviso de apuestas y juego responsable (aviso-apuestas.png). El texto
 * dibujado en el arte se duplica en sr-only para lectores de pantalla.
 */
export function BettingNotice() {
  return (
    <div
      className="relative w-full max-w-[26rem] sm:max-w-[30rem] lg:h-full lg:w-full lg:max-w-none"
      style={{ aspectRatio: "1774 / 887" }}
    >
      <Image
        src="/images/home/aviso-apuestas.png"
        alt=""
        aria-hidden
        fill
        sizes="(min-width: 1024px) 34rem, 90vw"
        className="select-none object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.5)]"
        draggable={false}
      />
      <div className="sr-only">
        <p>
          Apuesta mínima S/{BET_MIN}, apuesta máxima S/{BET_MAX}.
        </p>
        <p>Solo mayores de 18 años — juego responsable.</p>
      </div>
    </div>
  );
}
