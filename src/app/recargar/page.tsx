"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { compressImageToDataUrl, ImageError } from "@/lib/image";
import {
  ESTADO_RECARGA_COLOR,
  ESTADO_RECARGA_LABEL,
  MONTOS_RECARGA,
} from "@/lib/recargas";
import { RecargaResumen, crearRecarga, getMisRecargas } from "@/actions/recargas";

function RecargarContent() {
  const { showToast } = useToast();

  const [monto, setMonto] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [misRecargas, setMisRecargas] = useState<RecargaResumen[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const result = await getMisRecargas();
    if (result.ok) setMisRecargas(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  function handleFile(selected: File | null) {
    // El blob anterior queda colgado en memoria si no se revoca.
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return selected ? URL.createObjectURL(selected) : null;
    });
    setFile(selected);
    // Un <input type="file"> es no controlado: resetear el estado de React
    // no borra el nombre del archivo que muestra el navegador.
    if (!selected && fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (monto === null) {
      setError("Elige el monto que depositaste.");
      return;
    }
    if (!file) {
      setError("Adjunta una imagen del comprobante de depósito.");
      return;
    }

    setSubmitting(true);
    try {
      const comprobante = await compressImageToDataUrl(file);
      const result = await crearRecarga({ monto, comprobante });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({
        variant: "info",
        title: "Comprobante enviado",
        description: "Tu recarga quedó pendiente de revisión por un admin.",
      });
      setMonto(null);
      handleFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ImageError ? err.message : "No pudimos enviar tu recarga.");
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
          Yapea el monto al QR, guarda la captura y súbela acá. El equipo
          verifica la hora y el monto del depósito antes de acreditarte.
        </p>

        <Panel className="mt-6 p-5">
          <h2 className="font-fantasy text-lg font-semibold text-gold-light">
            1 · Yapea el monto
          </h2>
          <p className="mt-1 text-sm text-parchment/60">
            Escanea el QR desde la app de Yape, tómale captura y súbelo
            desde tu galería.
          </p>

          <div className="mt-4 flex justify-center">
            {/* Fondo blanco fijo: el QR necesita contraste alto para que la
                cámara lo lea, y el tema del sitio es oscuro. */}
            <a
              href="/images/yape-qr.jpg"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir el QR de Yape en grande"
              className="rounded-lg bg-white p-2 transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              <Image
                src="/images/yape-qr.jpg"
                alt="Código QR de Yape para depositar"
                width={916}
                height={1016}
                className="h-auto w-full max-w-[16rem] select-none"
                priority
              />
            </a>
          </div>

          <p className="mt-3 text-center text-xs text-parchment/50">
            Toca el QR para verlo en grande
          </p>
        </Panel>

        <Panel className="mt-4 p-5">
          <h2 className="mb-1 font-fantasy text-lg font-semibold text-gold-light">
            2 · Registra tu depósito
          </h2>
          <p className="mb-4 text-sm text-parchment/60">
            El monto debe coincidir con el del comprobante — si no cuadra, el
            equipo acredita lo que diga la captura.
          </p>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <fieldset>
              <legend className="mb-1.5 block text-sm text-parchment/80">
                Monto depositado (S/)
              </legend>
              <div className="grid grid-cols-5 gap-2">
                {MONTOS_RECARGA.map((opcion) => (
                  <button
                    key={opcion}
                    type="button"
                    aria-pressed={monto === opcion}
                    onClick={() => setMonto(opcion)}
                    className={clsx(
                      "min-h-11 rounded-md border px-2 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-gold-light",
                      monto === opcion
                        ? "border-gold bg-gold-dark/40 text-gold-light"
                        : "border-gold-dark bg-obsidian/60 text-parchment/80 hover:border-gold-light"
                    )}
                  >
                    S/{opcion}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="comprobante" className="mb-1.5 block text-sm text-parchment/80">
                Captura del Yape
              </label>
              <p className="mb-1.5 text-xs text-parchment/50">
                Debe verse la hora y el monto — es con eso que el equipo
                confirma tu depósito.
              </p>
              <input
                id="comprobante"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-parchment/70 file:mr-3 file:min-h-11 file:rounded-md file:border file:border-gold-dark file:bg-obsidian/60 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gold-light"
              />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob local, no un asset remoto optimizable
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
          {misRecargas === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : misRecargas.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no enviaste ninguna recarga.
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {misRecargas.map((r) => (
                <Panel key={r.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-fantasy font-bold text-gold-light">
                      S/{r.monto_acreditado ?? r.monto_solicitado}
                      {r.monto_acreditado !== null &&
                      Number(r.monto_acreditado) !== Number(r.monto_solicitado) ? (
                        <span className="ml-2 text-xs font-normal text-parchment/50">
                          (declaraste S/{r.monto_solicitado})
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-parchment/50">
                      {new Date(r.created_at).toLocaleString("es-PE")}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      "shrink-0 text-xs font-semibold",
                      ESTADO_RECARGA_COLOR[r.estado]
                    )}
                  >
                    {ESTADO_RECARGA_LABEL[r.estado]}
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
    <RequirePlayer>
      <RecargarContent />
    </RequirePlayer>
  );
}
