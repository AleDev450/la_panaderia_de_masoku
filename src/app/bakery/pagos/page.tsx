"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import {
  AjusteYapeConAdmin,
  IngresoConNombres,
  PagoManualConAdmin,
  UsuarioAdmin,
  getAjustesYape,
  getIngresosManuales,
  getMetricas,
  getPagosManuales,
  getUsuarios,
  registrarAjusteYape,
  registrarIngreso,
  registrarPagoManual,
} from "@/actions/admin";
import { AdminMetricas } from "@/lib/supabase/types";

function AdminPagosContent() {
  const { showToast } = useToast();
  const [pagos, setPagos] = useState<PagoManualConAdmin[] | null>(null);
  const [ajustes, setAjustes] = useState<AjusteYapeConAdmin[] | null>(null);
  const [metricas, setMetricas] = useState<AdminMetricas | null>(null);
  const [ingresos, setIngresos] = useState<IngresoConNombres[] | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);

  const [conceptoIngreso, setConceptoIngreso] = useState("");
  const [montoIngreso, setMontoIngreso] = useState("");
  const [usuarioIngreso, setUsuarioIngreso] = useState("");
  const [enviandoIngreso, setEnviandoIngreso] = useState(false);

  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [montoAjuste, setMontoAjuste] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [enviandoAjuste, setEnviandoAjuste] = useState(false);

  const refresh = useCallback(async () => {
    const [pagosResult, ajustesResult, metricasResult, ingresosResult, usuariosResult] =
      await Promise.all([
        getPagosManuales(),
        getAjustesYape(),
        getMetricas(),
        getIngresosManuales(),
        getUsuarios(),
      ]);
    if (pagosResult.ok) setPagos(pagosResult.data);
    if (ajustesResult.ok) setAjustes(ajustesResult.data);
    if (metricasResult.ok) setMetricas(metricasResult.data);
    // Si 0044 todavía no corrió, lista vacía en vez de "Cargando…" eterno.
    setIngresos(ingresosResult.ok ? ingresosResult.data : []);
    if (usuariosResult.ok) setUsuarios(usuariosResult.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  async function handleIngreso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const montoNumber = Number(montoIngreso);
    if (!conceptoIngreso.trim() || !Number.isFinite(montoNumber) || montoNumber <= 0) {
      showToast({
        variant: "warning",
        title: "Datos incompletos",
        description: "Indica de dónde vino la plata y un monto mayor a 0.",
      });
      return;
    }

    setEnviandoIngreso(true);
    try {
      const result = await registrarIngreso({
        concepto: conceptoIngreso.trim(),
        monto: montoNumber,
        usuarioId: usuarioIngreso,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo registrar", description: result.error });
        return;
      }
      const nick = usuarios.find((u) => u.id === usuarioIngreso)?.nickname;
      showToast({
        variant: "success",
        title: `Ingreso de S/${result.data.monto} registrado`,
        description: nick
          ? `Se le acreditaron S/${result.data.monto} a ${nick}.`
          : "No se le acreditó saldo a nadie: queda como plata tuya.",
      });
      setConceptoIngreso("");
      setMontoIngreso("");
      setUsuarioIngreso("");
      await refresh();
    } finally {
      setEnviandoIngreso(false);
    }
  }

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

  async function handleSubmitAjuste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const montoNumber = Number(montoAjuste);
    if (!motivoAjuste.trim() || !Number.isFinite(montoNumber) || montoNumber === 0) {
      showToast({
        variant: "warning",
        title: "Datos incompletos",
        description: "Indica el motivo y un monto distinto de 0 (puede ser negativo).",
      });
      return;
    }

    setEnviandoAjuste(true);
    try {
      const result = await registrarAjusteYape({ monto: montoNumber, motivo: motivoAjuste.trim() });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo registrar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Ajuste registrado",
        description: `${result.data.monto > 0 ? "+" : ""}S/${result.data.monto} · ${result.data.motivo}`,
      });
      setMontoAjuste("");
      setMotivoAjuste("");
      await refresh();
    } finally {
      setEnviandoAjuste(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-bold text-parchment">
          Pagos y ajustes de Yape
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          Registra acá cada vez que sacas dinero del Yape de la plataforma
          por fuera del juego — un retiro para ti o un pago a un
          trabajador — y corrige el número de abajo si quedó mal por algo
          que no pasó por el flujo normal (ej. una recarga de prueba
          aprobada sin que entrara plata real).
        </p>

        {metricas ? (
          <Panel className="mt-6 border-gold-light/50 bg-gold/5 p-5">
            <p className="text-[11px] uppercase tracking-wide text-parchment/40">
              Reconciliación de Yape
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-gold-light">
              En Yape deberías tener: S/{metricas.yape_esperado}
            </p>
            <p className="mt-2 text-xs text-parchment/60">
              = Ganancia S/{metricas.ganancia_total} + Depósitos de
              jugadores sin retirar S/{metricas.saldos_usuarios_total} −
              Pagos ya realizados S/{metricas.pagos_manuales_total}
              {metricas.ajustes_yape_total !== 0
                ? ` ${metricas.ajustes_yape_total > 0 ? "+" : "−"} Ajustes S/${Math.abs(metricas.ajustes_yape_total)}`
                : ""}
            </p>
          </Panel>
        ) : null}

        <Panel className="mt-6 border-win-glow/40 bg-win/5 p-5">
          <h2 className="mb-1 font-display text-lg font-semibold text-win-glow">
            Registrar ingreso del día
          </h2>
          <p className="mb-3 text-xs leading-relaxed text-parchment/60">
            Plata que entró SIN pasar por el flujo de recargas: efectivo,
            transferencia, lo que sea. Cuenta como ingreso del día y sube lo
            que deberías tener, igual que una recarga aprobada. Si eliges un
            jugador, se le acredita el saldo acá mismo — no hagas además un
            &quot;Ajustar saldo&quot;, contarías la plata dos veces.
          </p>
          <form onSubmit={handleIngreso} className="flex flex-col gap-3">
            <div>
              <label htmlFor="concepto-ingreso" className="mb-1.5 block text-sm text-parchment/80">
                De dónde vino
              </label>
              <input
                id="concepto-ingreso"
                value={conceptoIngreso}
                onChange={(e) => setConceptoIngreso(e.target.value)}
                placeholder="Ej. Efectivo de Juan, 2 recargas de 10"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </div>
            <div>
              <label htmlFor="monto-ingreso" className="mb-1.5 block text-sm text-parchment/80">
                Monto
              </label>
              <input
                id="monto-ingreso"
                type="number"
                min={0.01}
                step="0.01"
                inputMode="decimal"
                value={montoIngreso}
                onChange={(e) => setMontoIngreso(e.target.value)}
                className="min-h-12 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-lg font-semibold text-parchment outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-gold-light [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div>
              <label htmlFor="usuario-ingreso" className="mb-1.5 block text-sm text-parchment/80">
                Acreditarle el saldo a (opcional)
              </label>
              <select
                id="usuario-ingreso"
                value={usuarioIngreso}
                onChange={(e) => setUsuarioIngreso(e.target.value)}
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              >
                <option value="">Nadie — la plata es tuya</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nickname}
                    {u.fullName ? ` · ${u.fullName}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="win" disabled={enviandoIngreso}>
              {enviandoIngreso ? "Registrando…" : "Registrar ingreso"}
            </Button>
          </form>
        </Panel>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Historial de ingresos
          </h2>
          {ingresos === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : ingresos.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no registraste ningún ingreso por fuera de las recargas.
            </Panel>
          ) : (
            <div className="space-y-2">
              {ingresos.map(({ ingreso, adminNickname, usuarioNickname }) => (
                <Panel key={ingreso.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-parchment">{ingreso.concepto}</p>
                    <p className="text-xs text-parchment/50">
                      {new Date(ingreso.created_at).toLocaleString("es-PE", {
                        timeZone: "America/Lima",
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · registró {adminNickname}
                      {usuarioNickname ? ` · saldo a ${usuarioNickname}` : " · sin acreditar a nadie"}
                    </p>
                  </div>
                  <p className="font-display text-lg font-bold text-win-glow">
                    +S/{ingreso.monto}
                  </p>
                </Panel>
              ))}
            </div>
          )}
        </section>

        <Panel className="mt-6 p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
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
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Historial de pagos
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
                      {pago.afecta_ganancia ? " · resta de la ganancia" : ""}
                    </p>
                  </div>
                  <span className="font-display font-bold text-lose-glow">S/{pago.monto}</span>
                </Panel>
              ))}
            </div>
          )}
        </section>

        <Panel className="mt-10 p-5">
          <h2 className="mb-1 font-display text-lg font-semibold text-gold-light">
            Corregir reconciliación
          </h2>
          <p className="mb-3 text-xs text-parchment/50">
            No mueve saldo de nadie — solo corrige el número de &quot;En
            Yape deberías tener&quot; cuando ya sabes que está mal. Usa un
            monto negativo para restar (ej. −50 si aprobaste una recarga
            de prueba que nunca entró de verdad).
          </p>
          <form onSubmit={handleSubmitAjuste} className="flex flex-col gap-3">
            <div>
              <label htmlFor="motivo-ajuste" className="mb-1.5 block text-sm text-parchment/80">
                Motivo
              </label>
              <input
                id="motivo-ajuste"
                value={motivoAjuste}
                onChange={(e) => setMotivoAjuste(e.target.value)}
                placeholder="Ej. Recarga de prueba aprobada por error"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </div>
            <div>
              <label htmlFor="monto-ajuste" className="mb-1.5 block text-sm text-parchment/80">
                Monto (negativo para restar)
              </label>
              <input
                id="monto-ajuste"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={montoAjuste}
                onChange={(e) => setMontoAjuste(e.target.value)}
                placeholder="-50"
                className="min-h-12 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-lg font-semibold text-parchment outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-gold-light [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <Button type="submit" variant="ghost" disabled={enviandoAjuste}>
              {enviandoAjuste ? "Registrando…" : "Registrar ajuste"}
            </Button>
          </form>
        </Panel>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Historial de ajustes
          </h2>
          {ajustes === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : ajustes.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no registraste ningún ajuste.
            </Panel>
          ) : (
            <div className="flex flex-col gap-2">
              {ajustes.map(({ ajuste, adminNickname }) => (
                <Panel
                  key={ajuste.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="text-parchment/80">{ajuste.motivo}</p>
                    <p className="text-xs text-parchment/40">
                      {adminNickname} · {new Date(ajuste.created_at).toLocaleString("es-PE")}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      "font-display font-bold",
                      ajuste.monto > 0 ? "text-win-glow" : "text-lose-glow"
                    )}
                  >
                    {ajuste.monto > 0 ? "+" : ""}S/{ajuste.monto}
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

export default function AdminPagosPage() {
  return (
    <RequireAdmin>
      <AdminPagosContent />
    </RequireAdmin>
  );
}
