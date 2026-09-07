"use client";

import Link from "next/link";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";

/**
 * La portada de los juegos.
 *
 * Antes ruleta y cara o sello colgaban sueltos del menú y competían por
 * espacio con el resto; cada juego nuevo obligaba a pelear por un hueco en la
 * fila. Acá entran todos y el menú queda con una sola entrada.
 *
 * EL ARTE ES CSS, NO IMÁGENES. No hay ilustraciones de juegos en el proyecto,
 * y cada tarjeta se dibuja con degradados y un icono grande sobre la paleta
 * de la marca. Pesa cero, escala a cualquier pantalla y no depende de
 * conseguir arte para poder publicar.
 */

type Juego = {
  href: string;
  titulo: string;
  descripcion: string;
  icono: string;
  /** El sello de arriba a la izquierda del arte. */
  etiqueta: string;
  /** Los dos colores del degradado del arte. */
  de: string;
  a: string;
  /** Color del icono y del resplandor. */
  acento: string;
};

const JUEGOS: Juego[] = [
  {
    href: "/ruleta",
    titulo: "Ruleta",
    descripcion:
      "Pozo común. Cada S/3 es un ticket, y mientras más tickets tengas más pedazo de la rueda ocupas.",
    icono: "🎡",
    etiqueta: "Pozo acumulado",
    de: "#3a2a05",
    a: "#0d0d10",
    acento: "#f5c518",
  },
  {
    href: "/cara-o-sello",
    titulo: "Cara o sello",
    descripcion:
      "Uno contra uno. Abres mesa con tu lado y tu monto, y el staff lanza la moneda en vivo.",
    icono: "🪙",
    etiqueta: "1 vs 1",
    de: "#2b2f3a",
    a: "#0d0d10",
    acento: "#cfd3dc",
  },
  {
    href: "/caballitos",
    titulo: "Caballitos",
    descripcion:
      "Un caballo por cada ticket del sorteo. Corren todos juntos y el primero en cruzar se lleva el premio.",
    icono: "🐎",
    etiqueta: "Carrera",
    de: "#0c2f1c",
    a: "#0d0d10",
    acento: "#4ade80",
  },
];

function JuegosContent() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="title-cachudo text-4xl text-parchment sm:text-5xl">Juegos</h1>
        <p className="mt-2 max-w-2xl text-sm text-parchment/60">
          Elige uno y entra. En todos, el resultado lo decide el servidor antes de que la
          pantalla empiece a moverse — la animación solo muestra lo que ya se decidió.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {JUEGOS.map((juego) => (
            <TarjetaJuego key={juego.href} juego={juego} />
          ))}
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-parchment/40">
          ¿Buscas las salas de apuestas entre jugadores? Están en{" "}
          <Link href="/partidas" className="text-gold-light underline">
            Casino en vivo
          </Link>
          , junto con el blackjack y el baccarat.
        </p>
      </main>
    </>
  );
}

function TarjetaJuego({ juego }: { juego: Juego }) {
  return (
    <Link
      href={juego.href}
      className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:outline-none"
    >
      <article className="panel-stone panel-glow flex h-full flex-col overflow-hidden rounded-xl">
        {/* --------------------------------------------------------- arte */}
        <div
          className="relative flex aspect-[16/10] items-center justify-center overflow-hidden"
          style={{ background: `linear-gradient(150deg, ${juego.de}, ${juego.a} 72%)` }}
        >
          {/* Resplandor detrás del icono: es lo que hace que el arte se lea
              como una ficha de casino y no como un cuadro de color plano. */}
          <span
            aria-hidden
            className="absolute h-40 w-40 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-90"
            style={{ background: juego.acento, opacity: 0.22 }}
          />
          {/* Trama técnica, la misma idea del fondo del sitio. */}
          <span
            aria-hidden
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(0deg, #fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          <span
            aria-hidden
            className="relative text-7xl transition-transform duration-300 group-hover:scale-110 sm:text-8xl"
            style={{ filter: `drop-shadow(0 0 22px ${juego.acento}66)` }}
          >
            {juego.icono}
          </span>

          <span
            className="absolute left-3 top-3 rounded-full border px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider"
            style={{ borderColor: `${juego.acento}55`, color: juego.acento }}
          >
            {juego.etiqueta}
          </span>
        </div>

        {/* -------------------------------------------------------- texto */}
        <div className="flex flex-1 flex-col p-5">
          <h2 className="font-display text-xl font-bold text-parchment">{juego.titulo}</h2>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-parchment/55">
            {juego.descripcion}
          </p>
          <span
            aria-hidden
            className="mt-4 font-display text-xs font-bold uppercase tracking-wide text-gold transition group-hover:text-gold-light"
          >
            Jugar →
          </span>
        </div>
      </article>
    </Link>
  );
}

export default function JuegosPage() {
  return (
    <RequirePlayer>
      <JuegosContent />
    </RequirePlayer>
  );
}
