"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { PagoManualConAdmin, getMetricas, getPagosManuales, registrarPagoManual } from "@/actions/admin";
import { AdminMetricas } from "@/lib/supabase/types";

function AdminPagosContent() {
  const { showToast } = useToast();
  const [pagos, setPagos] = useState<PagoManualConAdmin[] | null>(null);
  const [metricas, setMetricas] = useState<AdminMetricas | null>(null);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const refresh = useCallback(async () => {
    const [pagosResult, metricasResult] = await Promise.all([getPagosManuales(), getMetricas()]);
    if (pagosResult.ok) setPagos(pagosResult.data);
    if (metricasResult.ok) setMetricas(metricasResult.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const montoNumber = Number(monto);
    if (!concepto.trim() || !Number.isFinite(montoNumber) || montoNumber <= 0) {
      showToast({
        variant: "warning",
        title: "Datos incompletos",
        description: "Indica a quién se pagó y un monto mayor a 0.",
      });
      return;
    }

    setEnviando(true);
    try {
      const result = await registrarPagoManual({ concepto: concepto.trim(), monto: montoNumber });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo registrar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Pago registrado",
        description: `S/${result.data.monto} · ${result.data.concepto}`,
      });
      setConcepto("");
      setMonto("");
      await refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Pagos manuales</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Registra acá cada vez que sacas dinero del Yape de la plataforma
          por fuera del juego — un retiro para ti o un pago a un
          trabajador. No mueve el saldo de ningún jugador: es solo el
          registro que explica el hueco entre lo que debería haber en Yape
          y lo que hay de verdad.
        </p>

        {metricas ? (
          <Panel className="mt-6 border-gold-light/50 bg-gold/5 p-5">
            <p className="text-[11px] uppercase tracking-wide text-parchment/40">
              Reconciliación de Yape
            </p>
            <p className="mt-1 font-fantasy text-2xl font-bold text-gold-light">
              En Yape deberías tener: S/{metricas.yape_esperado}
            </p>
            <p className="mt-2 text-xs text-parchment/60">
              = Ganancia S/{metricas.ganancia_total} + Depósitos de
              jugadores sin retirar S/{metricas.saldos_usuarios_total} −
              Pagos ya realizados S/{metricas.pagos_manuales_total}
            </p>
          </Panel>
        ) : null}

        <Panel className="mt-6 p-5">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Registrar pago
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label htmlFor="concepto" className="mb-1.5 block text-sm text-parchment/80">
                A quién / para qué
              </label>
              <input
                id="concepto"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej. Pago a Juan Pérez, ayudante de caja"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </div>
            <div>
              <label htmlFor="monto-pago" className="mb-1.5 block text-sm text-parchment/80">
                Monto
              </label>
              <input
                id="monto-pago"
                type="number"
                min={0.01}
                step="0.01"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="min-h-12 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-lg font-semibold text-parchment outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-gold-light [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Registrando…" : "Registrar pago"}
            </Button>
          </form>
        </Panel>

        <section className="mt-8">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Historial
          </h2>
          {pagos === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : pagos.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no registraste ningún pago.
            </Panel>
          ) : (
            <div className="flex flex-col gap-2">
              {pagos.map(({ pago, adminNickname }) => (
                <Panel
                  key={pago.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="text-parchment/80">{pago.concepto}</p>
                    <p className="text-xs text-parchment/40">
                      {adminNickname} · {new Date(pago.created_at).toLocaleString("es-PE")}
                    </p>
                  </div>
                  <span className="font-fantasy font-bold text-lose-glow">S/{pago.monto}</span>
                </Panel>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default function AdminPagosPage() {
  return (
    <RequireAdmin>
      <AdminPagosContent />
    </RequireAdmin>
  );
}
