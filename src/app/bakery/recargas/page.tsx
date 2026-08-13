"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { ComprobanteLightbox } from "@/components/bakery/ComprobanteLightbox";
import { useToast } from "@/context/ToastContext";
import {
  RecargaConUsuario,
  borrarTodasLasRecargas,
  getRecargas,
  resolverRecarga,
} from "@/actions/recargas";

import { HERRAMIENTAS_PRUEBA } from "@/lib/flags";

function AdminRecargasContent() {
  const { showToast } = useToast();
  const [recargas, setRecargas] = useState<RecargaConUsuario[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<RecargaConUsuario | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  /** Monto editado por recarga; ausente = se acredita lo que declaró el jugador. */
  const [montos, setMontos] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const result = await getRecargas();
    if (result.ok) setRecargas(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  async function handleResolver(item: RecargaConUsuario, aprobar: boolean) {
    const { recarga, usuario } = item;
    setProcesando(recarga.id);
    try {
      let montoAcreditado: number | undefined;
      if (aprobar) {
        const editado = montos[recarga.id];
        if (editado !== undefined && editado !== "") {
          const parsed = Number(editado);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            showToast({
              variant: "warning",
              title: "Monto inválido",
              description: "Corrige el monto antes de aprobar.",
            });
            return;
          }
          montoAcreditado = parsed;
        }
      }

      const result = await resolverRecarga({ recargaId: recarga.id, aprobar, montoAcreditado });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo resolver", description: result.error });
        return;
      }

      showToast({
        variant: aprobar ? "success" : "warning",
        title: aprobar ? "Recarga aprobada" : "Recarga rechazada",
        description: aprobar
          ? `Se acreditaron S/${result.data.monto_acreditado} a ${usuario.nickname}.`
          : `Se marcó como incorrecta la recarga de ${usuario.nickname}.`,
      });
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function handleBorrarTodo() {
    setBorrando(true);
    try {
      const result = await borrarTodasLasRecargas();
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo borrar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: `${result.data} recarga(s) borradas`,
        description: "El saldo ya acreditado no se revirtió.",
      });
      setConfirmarBorrado(false);
      await refresh();
    } finally {
      setBorrando(false);
    }
  }

  const pendientes = (recargas ?? []).filter((r) => r.recarga.estado === "pendiente");
  const revisadas = (recargas ?? []).filter((r) => r.recarga.estado !== "pendiente");

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Recargas</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Amplía el comprobante para verificar la hora y el monto del
          depósito, y confirma que el teléfono coincide con quien lo envió.
          Si el monto del comprobante no coincide con lo declarado, corrígelo
          antes de aprobar.
        </p>

        {HERRAMIENTAS_PRUEBA && (recargas?.length ?? 0) > 0 ? (
          <Panel className="mt-6 flex flex-wrap items-center justify-between gap-3 border-dashed border-lose/40 p-4">
            <div>
              <p className="font-fantasy text-sm font-bold text-lose-glow">
                Herramienta de pruebas
              </p>
              <p className="mt-0.5 text-xs text-parchment/50">
                Borra las {recargas?.length} recargas de la tabla. Desactívalo
                con NEXT_PUBLIC_HERRAMIENTAS_PRUEBA=false antes de abrir el
                registro al público.
              </p>
            </div>
            <Button
              type="button"
              variant="lose"
              disabled={borrando}
              onClick={() => setConfirmarBorrado(true)}
              className="min-h-9 px-3 py-1 text-xs"
            >
              Borrar todas
            </Button>
          </Panel>
        ) : null}

        <section className="mt-8">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Pendientes ({pendientes.length})
          </h2>
          {recargas === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : pendientes.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              No hay recargas pendientes.
            </Panel>
          ) : (
            <div className="flex flex-col gap-4">
              {pendientes.map((item) => {
                const { recarga, usuario } = item;
                return (
                  <Panel key={recarga.id} className="flex flex-col gap-4 p-4 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setAmpliada(item)}
                      aria-label={`Ampliar comprobante de ${usuario.nickname}`}
                      className="group relative shrink-0 overflow-hidden rounded-md border border-gold-dark/60 focus-visible:ring-2 focus-visible:ring-gold-light"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no un asset remoto optimizable */}
                      <img
                        src={recarga.comprobante}
                        alt={`Comprobante de ${usuario.nickname}`}
                        className="h-40 w-full object-contain sm:w-48"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold uppercase tracking-wide text-gold-light opacity-0 transition group-hover:opacity-100">
                        Ampliar
                      </span>
                    </button>

                    <div className="flex flex-1 flex-col justify-between gap-3">
                      <div>
                        <p className="font-fantasy text-lg font-bold text-gold-light">
                          {usuario.nickname}
                        </p>
                        {usuario.fullName ? (
                          <p className="text-sm text-parchment/80">{usuario.fullName}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-parchment/50">
                          Teléfono: {usuario.phone || "—"}
                        </p>
                        <p className="text-xs text-parchment/50">
                          Enviado: {new Date(recarga.created_at).toLocaleString("es-PE")}
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor={`monto-${recarga.id}`}
                          className="mb-1 block text-xs text-parchment/60"
                        >
                          Monto a acreditar (declaró S/{recarga.monto_solicitado})
                        </label>
                        <input
                          id={`monto-${recarga.id}`}
                          type="number"
                          min={1}
                          step="0.01"
                          inputMode="decimal"
                          placeholder={String(recarga.monto_solicitado)}
                          value={montos[recarga.id] ?? ""}
                          onChange={(e) =>
                            setMontos((prev) => ({ ...prev, [recarga.id]: e.target.value }))
                          }
                          className="min-h-11 w-full max-w-[12rem] rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-lg font-semibold text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                        />
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="win"
                          disabled={procesando === recarga.id}
                          onClick={() => handleResolver(item, true)}
                        >
                          Marcar correcto
                        </Button>
                        <Button
                          type="button"
                          variant="lose"
                          disabled={procesando === recarga.id}
                          onClick={() => handleResolver(item, false)}
                        >
                          Marcar incorrecto
                        </Button>
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </section>

        {revisadas.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
              Historial
            </h2>
            <div className="flex flex-col gap-2">
              {revisadas.map(({ recarga, usuario }) => (
                <Panel
                  key={recarga.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <span className="text-parchment/80">
                    {usuario.nickname} · S/
                    {recarga.monto_acreditado ?? recarga.monto_solicitado}
                    {recarga.monto_acreditado !== null &&
                    Number(recarga.monto_acreditado) !== Number(recarga.monto_solicitado) ? (
                      <span className="ml-1 text-xs text-parchment/50">
                        (declaró S/{recarga.monto_solicitado})
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={clsx(
                      "text-xs font-semibold",
                      recarga.estado === "aprobada" ? "text-win-glow" : "text-lose-glow"
                    )}
                  >
                    {recarga.estado === "aprobada" ? "Aprobada" : "Rechazada"}
                  </span>
                </Panel>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {confirmarBorrado ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Borrar todas las recargas"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmarBorrado(false);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-lose-glow">
              Borrar {recargas?.length} recarga(s)
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Se vacía la tabla entera: pendientes, aprobadas y rechazadas.
              No se puede deshacer.
            </p>
            <p className="mt-2 rounded-md border border-gold-dark/60 bg-obsidian/40 px-3 py-2 text-xs text-parchment/60">
              El <strong className="text-parchment/80">saldo ya acreditado no se revierte</strong>:
              los jugadores conservan su dinero, pero quedará sin una recarga
              que lo explique.
            </p>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="lose"
                disabled={borrando}
                onClick={handleBorrarTodo}
                className="flex-1"
              >
                {borrando ? "Borrando…" : "Sí, borrar todo"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmarBorrado(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {ampliada ? (
        <ComprobanteLightbox
          src={ampliada.recarga.comprobante}
          alt={`Comprobante de ${ampliada.usuario.nickname}${
            ampliada.usuario.phone ? ` · tel. ${ampliada.usuario.phone}` : ""
          } · declaró S/${ampliada.recarga.monto_solicitado}`}
          onClose={() => setAmpliada(null)}
        />
      ) : null}
    </>
  );
}

export default function AdminRecargasPage() {
  return (
    <RequireAdmin>
      <AdminRecargasContent />
    </RequireAdmin>
  );
}
