"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";

/**
 * Como RequireAuth, pero además saca al admin: el administrador no juega
 * — no apuesta, no recarga saldo, no aparece en el ranking. `crear_apuesta`
 * lo rechaza en SQL de todas formas (ver 0010_admin_control.sql); esto solo
 * evita que llegue a pantallas que no le sirven.
 */
export function RequirePlayer({ children }: { children: React.ReactNode }) {
  const { user, isReady, isAdmin } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    if (!user) router.replace("/");
    else if (isAdmin) router.replace("/bakery");
  }, [isReady, user, isAdmin, router]);

  if (!isReady || !user || isAdmin) return null;

  return <>{children}</>;
}
