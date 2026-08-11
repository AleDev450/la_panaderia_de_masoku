"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { Logo } from "@/components/Logo";
import { GameRulesSidebar } from "@/components/auth/GameRulesSidebar";
import { Mascot } from "@/components/Mascot";
import { AuthPanel } from "@/components/auth/AuthPanel";

export default function Home() {
  const { user, isReady } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isReady && user) router.replace("/partidas");
  }, [isReady, user, router]);

  if (!isReady || user) return null;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/images/plaza-background.png')] bg-cover bg-center"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-obsidian/20 via-transparent to-obsidian"
      />

      <main className="relative mx-auto flex w-full max-w-[1800px] flex-1 flex-col items-center gap-6 px-4 py-10 sm:px-6 xl:gap-4 xl:px-10 xl:py-12">
        {/* Título: siempre centrado, ancla visual de toda la pantalla. */}
        <Logo size="xl" href="" asImage />

        {/* Mascota: justo debajo del título, siempre centrada. */}
        <Mascot />

        {/* Reglas a la izquierda, acceso a la derecha — la mascota de
            arriba queda "entre" ambas, dando la sensación de una sola
            composición en vez de piezas sueltas. */}
        <div className="flex w-full flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center lg:gap-10 xl:gap-16">
          <section aria-label="Cómo funcionan las apuestas 1 contra 1" className="flex w-full justify-center lg:w-auto">
            <GameRulesSidebar />
          </section>

          <section aria-label="Acceso a tu cuenta" className="flex w-full justify-center lg:w-auto">
            <AuthPanel />
          </section>
        </div>
      </main>
    </div>
  );
}
