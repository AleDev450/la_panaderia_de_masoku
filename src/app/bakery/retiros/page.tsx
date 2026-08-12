"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { RetiroConUsuario, getRetiros, resolverRetiro } from "@/actions/retiros";

function AdminRetirosContent() {
  const { showToast } = useToast();
  const [retiros, setRetiros] = useState<RetiroConUsuario[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<RetiroConUsuario | null>(null);
  const [motivo, setMotivo] = useState("");

  const refresh = useCallback(async () => {
    const result = await getRetiros();
    if (result.ok) setRetiros(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  async function handleResolver(item: RetiroConUsuario, pagar: boolean, motivoTexto?: string) {
    const { retiro, usuario } = item;
    setProcesando(retiro.id);
    try {
      const result = await resolverRetiro({
        retiroId: retiro.id,
        pagar,
        motivo: motivoTexto || undefined,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo resolver", description: result.error });
        return;
      }
      showToast({
        variant: pagar ? "success" : "warning",
        title: pagar ? "Retiro marcado como pagado" : "Retiro rechazado",
        description: pagar
          ? `S/${retiro.monto} salieron del saldo de ${usuario.nickname}.`
          : `S/${retiro.monto} volvieron al saldo de ${usuario.nickname}.`,
      });
      setRechazando(null);
      setMotivo("");
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  const pendientes = (retiros ?? []).filter((r) => r.retiro.estado === "pendiente");
  const revisados = (retiros ?? []).filter((r) => r.retiro.estado !== "pendiente");
  const totalPendiente = pendientes.reduce((sum, r) => sum + Number(r.retiro.monto), 0);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Retiros</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Yapea el monto al número indicado y recién entonces marca como
          pagado. El saldo ya está apartado del jugador desde que lo
          solicitó; marcarlo pagado lo saca definitivamente.
        </p>

        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-fantasy text-lg font-semibold text-gold-light">
              Por pagar ({pendientes.length})
            </h2>
            {totalPendiente > 0 ? (
              <span className="font-fantasy text-sm font-bold text-parchment">
                Total: S/{totalPendiente}
              </span>
            ) : null}
          </div>

          {retiros === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : pendientes.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              No hay retiros pendientes.
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {pendientes.map((item) => {
                const { retiro, usuario } = item;
                return (
                  <Panel key={retiro.id} className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-fantasy text-lg font-bold text-gold-light">
                          {usuario.nickname}
                        </p>
                        {usuario.fullName ? (
                          <p className="text-sm text-parchment/80">{usuario.fullName}</p>
                        ) : null}
                        <p className="mt-1 text-sm text-parchment/80">
                          Yapear a{" "}
                          <span className="font-fantasy font-bold text-parchment">
                            {retiro.telefono_destino}
                          </span>
                        </p>
                        <p className="text-xs text-parchment/50">
                          Solicitado: {new Date(retiro.created_at).toLocaleString("es-PE")}
                        </p>
                      </div>
                      <p className="font-fantasy text-2xl font-bold text-parchment">
                        S/{retiro.monto}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="win"
                        disabled={procesando === retiro.id}
                        onClick={() => handleResolver(item, true)}
                      >
                        Marcar pagado
                      </Button>
                      <Button
                        type="button"
                        variant="lose"
                        disabled={procesando === retiro.id}
                        onClick={() => {
                          setRechazando(item);
                          setMotivo("");
                        }}
                      >
                        Rechazar
                      </Button>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </section>

        {revisados.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
              Historial
            </h2>
            <div className="flex flex-col gap-2">
              {revisados.map(({ retiro, usuario }) => (
                <Panel
                  key={retiro.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <span className="text-parchment/80">
                    {usuario.nickname} · S/{retiro.monto} → {retiro.telefono_destino}
                  </span>
                  <span
                    className={clsx(
                      "text-xs font-semibold",
                      retiro.estado === "pagado" ? "text-win-glow" : "text-lose-glow"
                    )}
                  >
                    {retiro.estado === "pagado" ? "Pagado" : "Rechazado"}
                  </span>
                </Panel>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {rechazando ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rechazar retiro"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRechazando(null);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-lose-glow">
              Rechazar retiro de {rechazando.usuario.nickname}
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Los S/{rechazando.retiro.monto} vuelven a su saldo disponible.
            </p>

            <label htmlFor="motivo-retiro" className="mt-4 mb-1.5 block text-sm text-parchment/80">
              Motivo (lo verá el jugador)
            </label>
            <textarea
              id="motivo-retiro"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="lose"
                disabled={procesando === rechazando.retiro.id}
                onClick={() => handleResolver(rechazando, false, motivo)}
                className="flex-1"
              >
                {procesando === rechazando.retiro.id ? "Rechazando…" : "Rechazar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRechazando(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function AdminRetirosPage() {
  return (
    <RequireAdmin>
      <AdminRetirosContent />
    </RequireAdmin>
  );
}
