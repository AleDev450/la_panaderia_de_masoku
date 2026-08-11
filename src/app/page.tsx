"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
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

      <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-16">
        <section aria-label="Cómo funcionan las apuestas 1 contra 1" className="flex w-full justify-center lg:w-auto lg:justify-start">
          <GameRulesSidebar />
        </section>

        <section aria-hidden className="order-first w-full max-w-sm lg:order-none lg:w-auto">
          <Mascot />
        </section>

        <section aria-label="Acceso a tu cuenta" className="flex w-full justify-center lg:w-auto">
          <AuthPanel />
        </section>
      </main>
    </div>
  );
}
