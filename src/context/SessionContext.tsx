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
  ensureSeedAdmin,
  getUserById,
  loginUser,
  registerUser,
} from "@/services/userService";

const SESSION_KEY = "lapanca:session";

interface SessionContextValue {
  user: User | null;
  isReady: boolean;
  isAdmin: boolean;
  register: (input: RegisterInput) => Promise<User>;
  login: (input: LoginInput) => Promise<User>;
  logout: () => void;
  /** Re-lee la cuenta desde el store — para reflejar saldo o puntos que
   * cambiaron desde otra pantalla (p.ej. una recarga aprobada). */
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    ensureSeedAdmin();
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap from localStorage on mount
      if (raw) setUser(JSON.parse(raw) as User);
    } catch {
      // ignore corrupted session
    } finally {
      setIsReady(true);
    }
  }, []);

  const persist = useCallback((next: User | null) => {
    setUser(next);
    if (next) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      const created = await registerUser(input);
      persist(created);
      return created;
    },
    [persist]
  );

  const login = useCallback(
    async (input: LoginInput) => {
      const found = await loginUser(input);
      persist(found);
      return found;
    },
    [persist]
  );

  const logout = useCallback(() => persist(null), [persist]);

  const refreshUser = useCallback(async () => {
    if (!user) return;
    const fresh = await getUserById(user.id);
    if (fresh) persist(fresh);
  }, [user, persist]);

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
