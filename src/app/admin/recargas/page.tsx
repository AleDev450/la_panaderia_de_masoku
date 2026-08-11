"use client";

import { useState } from "react";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useRecargas } from "@/context/RecargasContext";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { Recarga } from "@/types";

function AdminRecargasContent() {
  const { user } = useSession();
  const { recargas, aprobar, rechazar } = useRecargas();
  const { showToast } = useToast();
  const [processing, setProcessing] = useState<string | null>(null);

  if (!user) return null;

  const pendientes = recargas.filter((r) => r.estado === "pendiente");
  const revisadas = recargas.filter((r) => r.estado !== "pendiente");

  async function handleAprobar(recarga: Recarga) {
    if (!user) return;
    setProcessing(recarga.id);
    try {
      await aprobar(recarga.id, user.nickname);
      showToast({
        variant: "success",
        title: "Recarga aprobada",
        description: `Se acreditaron S/${recarga.monto} a ${recarga.userNickname}.`,
      });
    } finally {
      setProcessing(null);
    }
  }

  async function handleRechazar(recarga: Recarga) {
    if (!user) return;
    setProcessing(recarga.id);
    try {
      await rechazar(recarga.id, user.nickname);
      showToast({
        variant: "warning",
        title: "Recarga rechazada",
        description: `Se marcó como incorrecta la recarga de ${recarga.userNickname}.`,
      });
    } finally {
      setProcessing(null);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Recargas</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Verifica la hora del depósito en el comprobante antes de aprobar.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Pendientes ({pendientes.length})
          </h2>
          {pendientes.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              No hay recargas pendientes.
            </Panel>
          ) : (
            <div className="flex flex-col gap-4">
              {pendientes.map((r) => (
                <Panel key={r.id} className="flex flex-col gap-4 p-4 sm:flex-row">
                  {/* eslint-disable-next-line @next/next/no-img-element -- comprobante guardado como data URL local, no un asset remoto optimizable */}
                  <img
                    src={r.imagenDataUrl}
                    alt={`Comprobante de depósito de ${r.userNickname}`}
                    className="h-40 w-full rounded-md border border-gold-dark/60 object-contain sm:w-48"
                  />
                  <div className="flex flex-1 flex-col justify-between gap-3">
                    <div>
                      <p className="font-fantasy font-bold text-gold-light">
                        {r.userNickname} · S/{r.monto}
                      </p>
                      <p className="text-xs text-parchment/50">
                        Enviado: {new Date(r.createdAt).toLocaleString("es-PE")}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="win"
                        disabled={processing === r.id}
                        onClick={() => handleAprobar(r)}
                      >
                        Marcar correcto
                      </Button>
                      <Button
                        type="button"
                        variant="lose"
                        disabled={processing === r.id}
                        onClick={() => handleRechazar(r)}
                      >
                        Marcar incorrecto
                      </Button>
                    </div>
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
              {revisadas.map((r) => (
                <Panel key={r.id} className="flex items-center justify-between p-3 text-sm">
                  <span>
                    {r.userNickname} · S/{r.monto}
                  </span>
                  <span
                    className={
                      r.estado === "aprobada" ? "text-win-glow" : "text-lose-glow"
                    }
                  >
                    {r.estado === "aprobada" ? "Aprobada" : "Rechazada"} por{" "}
                    {r.revisadoPor}
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

export default function AdminRecargasPage() {
  return (
    <RequireAdmin>
      <AdminRecargasContent />
    </RequireAdmin>
  );
}
