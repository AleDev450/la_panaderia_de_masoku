"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Recarga } from "@/types";
import {
  CrearRecargaInput,
  aprobarRecarga,
  crearRecarga,
  listRecargas,
  rechazarRecarga,
} from "@/services/recargaService";
import { creditBalance } from "@/services/userService";

interface RecargasContextValue {
  recargas: Recarga[];
  crear: (input: CrearRecargaInput) => Promise<Recarga>;
  aprobar: (id: string, revisadoPor: string) => Promise<void>;
  rechazar: (id: string, revisadoPor: string) => Promise<void>;
}

const RecargasContext = createContext<RecargasContextValue | null>(null);

export function RecargasProvider({ children }: { children: React.ReactNode }) {
  const [recargas, setRecargas] = useState<Recarga[]>([]);

  const refresh = useCallback(async () => {
    setRecargas(await listRecargas());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap from localStorage on mount
    refresh();
  }, [refresh]);

  const crear = useCallback(
    async (input: CrearRecargaInput) => {
      const recarga = await crearRecarga(input);
      await refresh();
      return recarga;
    },
    [refresh]
  );

  const aprobar = useCallback(
    async (id: string, revisadoPor: string) => {
      const recarga = await aprobarRecarga(id, revisadoPor);
      await creditBalance(recarga.userId, recarga.monto);
      await refresh();
    },
    [refresh]
  );

  const rechazar = useCallback(
    async (id: string, revisadoPor: string) => {
      await rechazarRecarga(id, revisadoPor);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({ recargas, crear, aprobar, rechazar }),
    [recargas, crear, aprobar, rechazar]
  );

  return <RecargasContext.Provider value={value}>{children}</RecargasContext.Provider>;
}

export function useRecargas() {
  const ctx = useContext(RecargasContext);
  if (!ctx) throw new Error("useRecargas debe usarse dentro de RecargasProvider");
  return ctx;
}
