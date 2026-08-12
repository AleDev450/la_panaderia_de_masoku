"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import {
  SolicitudConPerfil,
  getSolicitudesTelefono,
  resolverSolicitudTelefono,
} from "@/actions/perfil";

function AdminTelefonosContent() {
  const { showToast } = useToast();
  const [solicitudes, setSolicitudes] = useState<SolicitudConPerfil[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await getSolicitudesTelefono();
    if (result.ok) setSolicitudes(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  async function handleResolver(solicitudId: string, aprobar: boolean) {
    setProcesando(solicitudId);
    try {
      const result = await resolverSolicitudTelefono({ solicitudId, aprobar });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo resolver", description: result.error });
        return;
      }
      showToast({
        variant: aprobar ? "success" : "warning",
        title: aprobar ? "Cambio aprobado" : "Solicitud rechazada",
      });
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  const pendientes = (solicitudes ?? []).filter((s) => s.solicitud.estado === "pendiente");
  const revisadas = (solicitudes ?? []).filter((s) => s.solicitud.estado !== "pendiente");

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">
          Cambios de teléfono
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          El número identifica los depósitos de un jugador, así que el cambio
          pasa por aquí en vez de dejarlo editar desde su perfil.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Pendientes ({pendientes.length})
          </h2>
          {solicitudes === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : pendientes.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              No hay solicitudes pendientes.
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {pendientes.map(({ solicitud, nickname }) => (
                <Panel key={solicitud.id} className="flex flex-col gap-3 p-4">
                  <div>
                    <p className="font-fantasy font-bold text-gold-light">{nickname}</p>
                    <p className="mt-0.5 text-sm text-parchment/80">
                      {solicitud.telefono_actual || "—"} →{" "}
                      <span className="font-semibold text-parchment">
                        {solicitud.telefono_nuevo}
                      </span>
                    </p>
                    {solicitud.motivo ? (
                      <p className="mt-1 text-xs text-parchment/50">
                        Motivo: {solicitud.motivo}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-parchment/40">
                      {new Date(solicitud.created_at).toLocaleString("es-PE")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="win"
                      disabled={procesando === solicitud.id}
                      onClick={() => handleResolver(solicitud.id, true)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      type="button"
                      variant="lose"
                      disabled={procesando === solicitud.id}
                      onClick={() => handleResolver(solicitud.id, false)}
                    >
                      Rechazar
                    </Button>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>

        {revisadas.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
              Historial
            </h2>
            <div className="flex flex-col gap-2">
              {revisadas.map(({ solicitud, nickname }) => (
                <Panel
                  key={solicitud.id}
                  className="flex items-center justify-between p-3 text-sm"
                >
                  <span className="text-parchment/70">
                    {nickname} · {solicitud.telefono_actual || "—"} →{" "}
                    {solicitud.telefono_nuevo}
                  </span>
                  <span
                    className={clsx(
                      "text-xs font-semibold",
                      solicitud.estado === "aprobada" ? "text-win-glow" : "text-lose-glow"
                    )}
                  >
                    {solicitud.estado === "aprobada" ? "Aprobada" : "Rechazada"}
                  </span>
                </Panel>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}

export default function AdminTelefonosPage() {
  return (
    <RequireAdmin>
      <AdminTelefonosContent />
    </RequireAdmin>
  );
}
