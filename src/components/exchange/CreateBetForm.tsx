"use client";

import { FormEvent, useState, useTransition } from "react";
import { crearApuesta } from "@/actions/betting";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";

export function CreateBetForm({
  eventoId,
  ladoALabel,
  ladoBLabel,
  onCreated,
}: {
  eventoId: string;
  ladoALabel: string;
  ladoBLabel: string;
  onCreated?: () => void;
}) {
  const { showToast } = useToast();
  const [lado, setLado] = useState<"a" | "b">("a");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const montoNumber = Number(monto);
    if (!Number.isFinite(montoNumber) || montoNumber <= 0) {
      setError("Ingresa un monto válido.");
      return;
    }

    startTransition(async () => {
      const result = await crearApuesta({ eventoId, lado, monto: montoNumber });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const matcheado = result.data.monto_matcheado;
      const pendiente = result.data.monto_pendiente;
      showToast({
        variant: "success",
        title: "Apuesta creada",
        description:
          matcheado > 0
            ? `Se emparejaron S/${matcheado} al instante. Pendiente por emparejar: S/${pendiente}.`
            : "Tu apuesta quedó en el libro esperando contraparte.",
      });
      setMonto("");
      onCreated?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="sr-only">Elige tu lado</legend>
        <SideOption
          label={ladoALabel}
          active={lado === "a"}
          onClick={() => setLado("a")}
        />
        <SideOption
          label={ladoBLabel}
          active={lado === "b"}
          onClick={() => setLado("b")}
        />
      </fieldset>

      <div>
        <label htmlFor="exchange-monto" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-parchment/50">
          Monto (S/)
        </label>
        <input
          id="exchange-monto"
          type="number"
          min={1}
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "exchange-monto-error" : undefined}
          className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-lg font-semibold text-parchment outline-none"
        />
        {error ? (
          <p id="exchange-monto-error" role="alert" className="mt-1 text-xs text-lose-glow">
            {error}
          </p>
        ) : null}
      </div>

      <p className="text-xs text-parchment/50">
        Cuota fija: <span className="font-semibold text-gold-light">1.80</span>. Si tu
        lado gana, cobras monto emparejado × 1.80. Lo no emparejado se
        devuelve si el evento se resuelve sin contraparte.
      </p>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Enviando…" : "Publicar apuesta"}
      </Button>
    </form>
  );
}

function SideOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-14 rounded-md border-2 px-2 font-fantasy text-sm font-bold tracking-wide transition ${
        active
          ? "border-gold-light bg-gold/15 text-gold-light"
          : "border-gold-dark/60 text-parchment/60 hover:border-gold-light/60"
      }`}
    >
      {label}
    </button>
  );
}
