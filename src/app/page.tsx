"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { GameRulesSidebar } from "@/components/auth/GameRulesSidebar";
import { Mascot } from "@/components/Mascot";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { BettingNotice } from "@/components/auth/BettingNotice";
import { HomeLogo } from "@/components/auth/HomeLogo";

export default function Home() {
  const { user, isReady } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isReady && user) router.replace("/partidas");
  }, [isReady, user, router]);

  if (!isReady || user) return null;

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-y-auto lg:h-screen lg:overflow-hidden">
      {/* Fondo a pantalla completa siempre (background.png es ~16:9, así
          que en la gran mayoría de pantallas de escritorio "cover" no
          recorta casi nada y la composición coincide con nuevo_index.png).
          Sin z-index: al ser el primer hijo del contenedor se pinta
          detrás de todo por orden normal del DOM — evita depender de
          contextos de apilamiento. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[url('/images/home/background.png')] bg-cover bg-center bg-no-repeat"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-gradient-to-b from-obsidian/10 via-transparent to-obsidian/35"
      />

      {/* En escritorio (lg:h-screen arriba le da al contenedor una altura
          definida, necesaria para que los "top: %" de los hijos en
          absoluto se calculen bien) cada sección se posiciona en
          porcentaje sobre el propio contenedor de la página, calibrado
          contra nuevas imagenes/nuevo_index.png. En pantallas < lg todo
          vuelve al flujo normal, apilado verticalmente. */}
      <header className="relative z-[2] flex justify-center pt-6 lg:absolute lg:left-[30.5%] lg:top-[3%] lg:w-[37%] lg:pt-0">
        <HomeLogo />
      </header>

      <section
        aria-label="Masoku, guardián de la masa"
        className="flex w-full justify-center px-4 pt-4 lg:absolute lg:left-[calc(10%_-_20px)] lg:top-[25%] lg:block lg:w-[27%] lg:justify-start lg:px-0 lg:pt-0"
      >
        <Mascot />
      </section>

      <section
        aria-label="Hoy se hornea"
        className="flex w-full justify-center px-4 pt-6 lg:absolute lg:left-1/2 lg:top-[52%] lg:w-[25%] lg:-translate-x-1/2 lg:px-0 lg:pt-0"
      >
        <GameRulesSidebar />
      </section>

      <section
        aria-label="Acceso a tu cuenta"
        className="flex w-full flex-1 justify-center px-4 pt-6 pb-4 lg:absolute lg:left-[68%] lg:top-[calc(8%_+_5px)] lg:w-[calc(28%_-_90px)] lg:flex-none lg:px-0 lg:pt-0 lg:pb-0"
      >
        <AuthPanel />
      </section>

      <footer className="relative z-[2] flex justify-center px-4 py-6 lg:absolute lg:left-1/2 lg:top-[80%] lg:h-[24%] lg:w-[90%] lg:-translate-x-1/2 lg:py-0">
        <BettingNotice />
      </footer>
    </div>
  );
}
