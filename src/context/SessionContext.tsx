"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { User } from "@/types";
import {
  LoginInput,
  RegisterInput,
  getUserById,
  loginUser,
  registerUser,
} from "@/services/userService";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface SessionContextValue {
  user: User | null;
  isReady: boolean;
  isAdmin: boolean;
  register: (input: RegisterInput) => Promise<User>;
  login: (input: LoginInput) => Promise<User>;
  logout: () => void;
  /** Re-lee el perfil desde Supabase — para reflejar saldo o puntos que
   * cambiaron desde otra pantalla (p.ej. una recarga aprobada). */
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function syncFromSession(userId: string | undefined) {
      const fresh = userId ? await getUserById(userId) : null;
      setUser(fresh);
    }

    supabase.auth.getSession().then(({ data }) => {
      syncFromSession(data.session?.user.id).finally(() => setIsReady(true));
    });

    // Mantiene el estado al día si la sesión cambia en otra pestaña, expira,
    // o se refresca el token — fuente de verdad real, no un cache propio.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      syncFromSession(session?.user.id);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const created = await registerUser(input);
    setUser(created);
    return created;
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const found = await loginUser(input);
    setUser(found);
    return found;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    createSupabaseBrowserClient().auth.signOut();
  }, []);

  const refreshUser = useCallback(async () => {
    if (!user) return;
    const fresh = await getUserById(user.id);
    if (fresh) setUser(fresh);
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      isReady,
      isAdmin: user?.rol === "admin",
      register,
      login,
      logout,
      refreshUser,
    }),
    [user, isReady, register, login, logout, refreshUser]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de SessionProvider");
  return ctx;
}
