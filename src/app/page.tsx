"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useSession } from "@/context/SessionContext";
import { GameRulesSidebar } from "@/components/auth/GameRulesSidebar";
import { Mascot } from "@/components/Mascot";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { BettingNotice } from "@/components/auth/BettingNotice";
import { HomeLogo } from "@/components/auth/HomeLogo";

export default function Home() {
  const { user, isReady } = useSession();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (isReady && user) router.replace("/partidas");
  }, [isReady, user, router]);

  if (!isReady || user) return null;

  const aparece = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, ease: "easeOut" as const },
      };

  return (
    /*
      El inicio ya no se posiciona en porcentajes sobre `background.png`.
      Ese fondo era una escena de panadería y toda la página estaba
      calibrada contra él (`lg:left-[30.5%] lg:top-[3%]`…), así que cambiar
      el arte descolocaba todo. Ahora es un hero en flujo normal: dos
      columnas en escritorio, apilado en móvil, con el fondo hecho de
      degradados en CSS (ver globals.css).
    */
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
      {/* Resplandor de marca detrás del hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-[1] h-[520px] w-[900px] max-w-[130vw] -translate-x-1/2 rounded-full bg-gold/10 blur-[110px]"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:py-12">
        <div className="grid flex-1 items-center gap-10 lg:grid-cols-[1.15fr_minmax(0,26rem)] lg:gap-12">
          {/* ---------------------------------------------------- izquierda */}
          <div className="flex flex-col">
            <HomeLogo />

            <motion.h1
              {...aparece}
              className="title-cachudo mt-8 text-[clamp(2.5rem,7vw,4.75rem)] text-parchment"
            >
              La apuesta
              <br />
              <span className="text-gold text-glow-gold">del cachudo</span>
            </motion.h1>

            <motion.p
              {...aparece}
              transition={{ ...aparece.transition, delay: 0.08 }}
              className="mt-5 max-w-md text-base leading-relaxed text-parchment/60 sm:text-lg"
            >
              Apuesta, gana y saca provecho.
              <br className="hidden sm:block" /> En CACHUDOBET jugamos en serio:
              uno contra uno, sin casa que juegue en tu contra.
            </motion.p>

            <motion.a
              {...aparece}
              transition={{ ...aparece.transition, delay: 0.16 }}
              href="#acceso"
              className="mt-7 inline-flex min-h-13 w-fit items-center gap-2.5 rounded-lg bg-gold px-7 py-3.5 font-display text-sm font-extrabold uppercase tracking-wide text-obsidian shadow-[0_10px_38px_-10px_rgba(245,197,24,0.9)] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              Regístrate ahora <span aria-hidden>→</span>
            </motion.a>

            {/* Masoku, protagonista, con los cachos de fondo. En móvil se
                muestra debajo del texto para no empujar el formulario. */}
            <div className="mt-10 flex items-end gap-8">
              <div className="w-44 shrink-0 sm:w-56 lg:w-64">
                <Mascot />
              </div>
              <div className="hidden flex-1 sm:block">
                <GameRulesSidebar />
              </div>
            </div>

            <div className="mt-8 sm:hidden">
              <GameRulesSidebar />
            </div>
          </div>

          {/* ----------------------------------------------------- derecha */}
          <section
            id="acceso"
            aria-label="Acceso a tu cuenta"
            className="w-full scroll-mt-6 justify-self-center lg:justify-self-end"
          >
            <AuthPanel />
          </section>
        </div>

        <footer className="mt-12">
          <BettingNotice />
        </footer>
      </main>
    </div>
  );
}
