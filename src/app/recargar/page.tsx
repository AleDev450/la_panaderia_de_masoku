"use client";

import { FormEvent, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/context/SessionContext";
import { useRecargas } from "@/context/RecargasContext";
import { useToast } from "@/context/ToastContext";
import { compressImageToDataUrl, ImageError } from "@/lib/image";
import { RecargaServiceError, validateMonto } from "@/services/recargaService";
import clsx from "clsx";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente de revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "text-gold-light",
  aprobada: "text-win-glow",
  rechazada: "text-lose-glow",
};

function RecargarContent() {
  const { user } = useSession();
  const { recargas, crear } = useRecargas();
  const { showToast } = useToast();

  const [monto, setMonto] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const misRecargas = recargas.filter((r) => r.userId === user.id);

  function handleFile(selected: File | null) {
    setFile(selected);
    setPreview(selected ? URL.createObjectURL(selected) : null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (!user) return;

    const montoNumber = Number(monto);
    const validation = validateMonto(montoNumber);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    if (!file) {
      setError("Adjunta una imagen del comprobante de depósito.");
      return;
    }

    setSubmitting(true);
    try {
      const imagenDataUrl = await compressImageToDataUrl(file);
      await crear({
        userId: user.id,
        userNickname: user.nickname,
        monto: montoNumber,
        imagenDataUrl,
      });
      showToast({
        variant: "info",
        title: "Comprobante enviado",
        description: "Tu recarga quedó pendiente de revisión por un admin.",
      });
      setMonto("");
      handleFile(null);
    } catch (err) {
      const message =
        err instanceof RecargaServiceError || err instanceof ImageError
          ? err.message
          : "No pudimos enviar tu recarga.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Recargar saldo</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Adjunta una imagen del comprobante de tu depósito — así el equipo
          puede verificar la hora y aprobar tu recarga.
        </p>

        <Panel className="mt-6 p-5">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div>
              <label htmlFor="monto" className="mb-1.5 block text-sm text-parchment/80">
                Monto depositado (S/)
              </label>
              <input
                id="monto"
                type="number"
                min={10}
                max={1000}
                inputMode="numeric"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-lg font-semibold text-parchment outline-none"
              />
            </div>

            <div>
              <label htmlFor="comprobante" className="mb-1.5 block text-sm text-parchment/80">
                Comprobante (imagen)
              </label>
              <input
                id="comprobante"
                type="file"
                accept="image/*"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-parchment/70 file:mr-3 file:min-h-11 file:rounded-md file:border file:border-gold-dark file:bg-obsidian/60 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gold-light"
              />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable remote asset
                <img
                  src={preview}
                  alt="Vista previa del comprobante"
                  className="mt-3 max-h-64 rounded-md border border-gold-dark/60 object-contain"
                />
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="text-sm text-lose-glow">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Enviando…" : "Enviar comprobante"}
            </Button>
          </form>
        </Panel>

        <section className="mt-8">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Tus recargas
          </h2>
          {misRecargas.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no enviaste ninguna recarga.
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {misRecargas.map((r) => (
                <Panel key={r.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-fantasy font-bold text-gold-light">S/{r.monto}</p>
                    <p className="text-xs text-parchment/50">
                      {new Date(r.createdAt).toLocaleString("es-PE")}
                    </p>
                  </div>
                  <span className={clsx("text-xs font-semibold", ESTADO_COLOR[r.estado])}>
                    {ESTADO_LABEL[r.estado]}
                  </span>
                </Panel>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default function RecargarPage() {
  return (
    <RequireAuth>
      <RecargarContent />
    </RequireAuth>
  );
}
