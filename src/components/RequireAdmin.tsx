"use client";

import Link from "next/link";
import { useSession } from "@/context/SessionContext";
import { BakeryLoginForm } from "@/components/bakery/BakeryLoginForm";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isReady, isAdmin } = useSession();

  if (!isReady) return null;

  if (!user) {
    return <BakeryLoginForm />;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-fantasy text-2xl font-bold text-lose-glow">Acceso restringido</h1>
        <p className="text-sm text-parchment/70">
          Tu cuenta no tiene permisos de panadería.
        </p>
        <Link href="/partidas" className="text-sm font-semibold text-gold-light underline">
          Volver a Partidas
        </Link>
      </main>
    );
  }

  return <>{children}</>;
}
