"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isReady, isAdmin } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!isAdmin) {
      router.replace("/partidas");
    }
  }, [isReady, user, isAdmin, router]);

  if (!isReady || !user || !isAdmin) return null;

  return <>{children}</>;
}
