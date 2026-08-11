import Image from "next/image";
import { BET_MAX, BET_MIN } from "@/types";
import { Logo } from "@/components/Logo";

export function GameRulesSidebar() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 lg:items-start">
      <Logo size="lg" href="" asImage />

      {/* El cartel ya trae el título, las reglas GANA/PIERDE 1:1, los
          montos y el aviso de 18+ dibujados — se mantiene decorativo y se
          duplica como texto accesible para lectores de pantalla. */}
      <div className="relative w-full max-w-sm" style={{ aspectRatio: "1134 / 1387" }}>
        <Image
          src="/images/reglas.png"
          alt=""
          aria-hidden
          fill
          sizes="(min-width: 1024px) 24rem, 90vw"
          className="select-none object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        />
      </div>

      <div className="sr-only">
        <h1>Cada apuesta encuentra su rival</h1>
        <p>
          Elige tu lado. Si alguien apuesta a que gana, el siguiente jugador
          toma que pierde. Mismo monto, mismas condiciones.
        </p>
        <p>Apuestas 1 contra 1: GANA (Jugador 1) contra PIERDE (Jugador 2).</p>
        <p>
          Apuesta mínima S/{BET_MIN}, apuesta máxima S/{BET_MAX}.
        </p>
        <p>Solo mayores de 18 años — juego responsable.</p>
      </div>
    </div>
  );
}
