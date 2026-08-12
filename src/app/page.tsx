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
    <div className="relative flex min-h-screen w-full flex-col overflow-y-auto lg:h-screen lg:overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[url('/images/plaza-background.png')] bg-cover bg-center"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-gradient-to-b from-obsidian/20 via-transparent to-obsidian"
      />

      {/* Marca en la esquina: el título grande ya no compite por espacio
          vertical con la fila principal — el cartel de reglas trae su
          propio encabezado. */}
      <div className="absolute left-4 top-4 z-10 lg:left-8 lg:top-6">
        <Logo size="sm" href="" />
      </div>

      {/* Fila única en pantallas grandes: reglas a la izquierda, mascota
          al centro, acceso a la derecha — todo cabe en un solo viewport
          (los paneles se dimensionan por alto de pantalla, no por ancho
          fijo, ver ArtPanel/GameRulesSidebar/Mascot). En pantallas chicas
          se apilan y la página puede hacer scroll normalmente. */}
      <main className="relative z-[1] mx-auto flex w-full max-w-[1800px] flex-1 flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6 lg:flex-row lg:gap-6 lg:px-8 lg:py-4 xl:gap-12">
        <section aria-label="Cómo funcionan las apuestas 1 contra 1" className="flex w-full justify-center lg:w-auto">
          <GameRulesSidebar />
        </section>

        <section aria-label="Mascota" className="flex w-full justify-center lg:w-auto">
          <Mascot />
        </section>

        <section aria-label="Acceso a tu cuenta" className="flex w-full justify-center lg:w-auto">
          <AuthPanel />
        </section>
      </main>
    </div>
  );
}
