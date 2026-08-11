"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isReady } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isReady && !user) router.replace("/");
  }, [isReady, user, router]);

  if (!isReady || !user) return null;

  return <>{children}</>;
}
