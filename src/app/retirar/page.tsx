"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { RequisitoRetiroInfo, getMisRetiros, getRequisitoRetiro, solicitarRetiro } from "@/actions/retiros";
import { ESTADO_RETIRO_COLOR, ESTADO_RETIRO_LABEL, RETIRO_MIN } from "@/lib/retiros";
import { Retiro } from "@/lib/supabase/types";

function RetirarContent() {
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [retiros, setRetiros] = useState<Retiro[] | null>(null);
  const [requisito, setRequisito] = useState<RequisitoRetiroInfo | null>(null);

  const refresh = useCallback(async () => {
    const [retirosResult, requisitoResult] = await Promise.all([
      getMisRetiros(),
      getRequisitoRetiro(),
    ]);
    if (retirosResult.ok) setRetiros(retirosResult.data);
    if (requisitoResult.ok) setRequisito(requisitoResult.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  if (!user) return null;

  const tienePendiente = (retiros ?? []).some((r) => r.estado === "pendiente");
  const sinTelefono = !user.phone;
  const faltaApostar = (requisito?.falta ?? 0) > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const montoNumber = Number(monto);
    if (!Number.isFinite(montoNumber) || montoNumber < RETIRO_MIN) {
      setError(`El retiro mínimo es S/${RETIRO_MIN}.`);
      return;
    }
    if (user && montoNumber > user.balance) {
      setError(`Tu saldo disponible es S/${user.balance}.`);
      return;
    }

    setEnviando(true);
    try {
      const result = await solicitarRetiro({ monto: montoNumber });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({
        variant: "info",
        title: "Retiro solicitado",
        description: `Se apartaron S/${result.data.monto} de tu saldo hasta que el equipo lo yapee.`,
      });
      setMonto("");
      await Promise.all([refresh(), refreshUser()]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Retirar saldo</h1>
        <p className="mt-2 text-sm text-parchment/60">
          El equipo te yapea al número que tienes registrado. Al solicitar, el
          monto se aparta de tu saldo — no lo puedes apostar mientras el
          retiro esté pendiente.
        </p>

        <Panel className="mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-parchment/40">
              Saldo disponible
            </p>
            <p className="font-fantasy text-2xl font-bold text-gold-light">
              S/{user.balance}
            </p>
            {user.balanceFake > 0 ? (
              // Sin esto, el header dice S/80 y esta pantalla S/30 sin que
              // nada explique la diferencia.
              <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-parchment/40">
                De tu saldo, S/{user.balanceFake} es saldo de cortesía: se
                puede apostar pero no retirar.
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-parchment/40">
              Se yapea a
            </p>
            <p className="font-fantasy text-lg font-bold text-parchment">
              {user.phone || "—"}
            </p>
          </div>
        </Panel>

        {requisito && requisito.montoRequerido > 0 ? (
          <Panel
            className={clsx(
              "mt-4 p-5",
              faltaApostar ? "border-lose/50" : "border-win/40"
            )}
          >
            <p className="text-sm text-parchment/80">
              Por cada recarga aprobada ({requisito.recargasAprobadas}) hay
              que apostar al menos S/5 antes de poder retirar. Llevas
              apostado S/{requisito.montoApostado} de S/{requisito.montoRequerido}{" "}
              requeridos.
            </p>
            {faltaApostar ? (
              <p className="mt-2 text-sm font-semibold text-lose-glow">
                Te falta apostar S/{requisito.falta} para poder retirar.
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-win-glow">
                Cumpliste el requisito — ya puedes retirar.
              </p>
            )}
          </Panel>
        ) : null}

        {sinTelefono ? (
          <Panel className="mt-4 border-lose/50 p-5">
            <p className="text-sm text-parchment/80">
              Necesitas un teléfono registrado para retirar.{" "}
              <Link href="/perfil" className="font-semibold text-gold-light underline">
                Ve a tu perfil
              </Link>{" "}
              para solicitarlo.
            </p>
          </Panel>
        ) : faltaApostar ? (
          <Panel className="mt-4 border-lose/50 p-5">
            <p className="text-sm text-parchment/80">
              Todavía no puedes retirar: te falta apostar S/{requisito?.falta}{" "}
              (ver arriba).
            </p>
          </Panel>
        ) : tienePendiente ? (
          <Panel className="mt-4 p-5">
            <p className="text-sm text-gold-light">
              Ya tienes un retiro pendiente de pago. Espera a que el equipo lo
              procese antes de pedir otro.
            </p>
          </Panel>
        ) : (
          <Panel className="mt-4 p-5">
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <div>
                <label htmlFor="monto" className="mb-1.5 block text-sm text-parchment/80">
                  Monto a retirar (mínimo S/{RETIRO_MIN})
                </label>
                <input
                  id="monto"
                  type="number"
                  min={RETIRO_MIN}
                  max={user.balance}
                  step="0.01"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="min-h-12 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-lg font-semibold text-parchment outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-gold-light [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-lose-glow">
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={enviando || user.balance < RETIRO_MIN}>
                {enviando
                  ? "Solicitando…"
                  : user.balance < RETIRO_MIN
                    ? `Necesitas al menos S/${RETIRO_MIN}`
                    : "Solicitar retiro"}
              </Button>
            </form>
          </Panel>
        )}

        <section className="mt-8">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Tus retiros
          </h2>
          {retiros === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : retiros.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no solicitaste ningún retiro.
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {retiros.map((r) => (
                <Panel key={r.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-fantasy font-bold text-gold-light">S/{r.monto}</p>
                    <p className="text-xs text-parchment/50">
                      a {r.telefono_destino} ·{" "}
                      {new Date(r.created_at).toLocaleString("es-PE")}
                    </p>
                    {r.estado === "rechazado" && r.motivo_rechazo ? (
                      <p className="mt-1 text-xs text-lose-glow">
                        Motivo: {r.motivo_rechazo}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={clsx(
                      "shrink-0 text-xs font-semibold",
                      ESTADO_RETIRO_COLOR[r.estado]
                    )}
                  >
                    {ESTADO_RETIRO_LABEL[r.estado]}
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

export default function RetirarPage() {
  return (
    <RequirePlayer>
      <RetirarContent />
    </RequirePlayer>
  );
}
