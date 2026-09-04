"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import {
  RondaAdmin,
  RondaResumen,
  agregarTickets,
  cambiarEstadoRonda,
  finalizarRonda,
  getConfig,
  getDetalleRonda,
  getRondas,
  girarRuleta,
  guardarConfig,
  guardarRonda,
} from "@/actions/ruleta";
import { UsuarioAdmin, getUsuarios } from "@/actions/admin";
import { CachudobetConfig } from "@/lib/supabase/types";
import { ESTADO_RONDA_LABEL, repartoDelPozo } from "@/lib/ruleta";

/**
 * CACHUDOBET → Rondas. El único lugar desde donde se gira la ruleta.
 *
 * El jugador NO tiene botón de girar: el sorteo lo dispara el staff y lo
 * resuelve Postgres. Esta pantalla es el control remoto, no el motor — cada
 * acción es un RPC que revalida `es_admin` por su cuenta.
 */

const soles = (n: number) => n.toFixed(2);
const numeroRonda = (n: number) => `#${String(n).padStart(4, "0")}`;

function AdminRuletaContent() {
  const { showToast } = useToast();
  const [rondas, setRondas] = useState<RondaAdmin[] | null>(null);
  const [config, setConfig] = useState<CachudobetConfig | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<RondaResumen | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await getRondas();
    setRondas(result.ok ? result.data : []);
  }, []);

  const cargarDetalle = useCallback(async (rondaId: string) => {
    const result = await getDetalleRonda(rondaId);
    setDetalle(result.ok ? result.data : null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    getConfig().then((r) => {
      if (r.ok) setConfig(r.data);
    });
    // Mientras hay una ronda abierta entran tickets todo el tiempo: sin esto
    // habría que recargar a mano para ver el pozo real antes de girar.
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!abierto) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al desplegar la ronda
    void cargarDetalle(abierto);
    const id = setInterval(() => void cargarDetalle(abierto), 5_000);
    return () => clearInterval(id);
  }, [abierto, cargarDetalle]);

  async function accion(
    id: string,
    ejecutar: () => Promise<{ ok: true } | { ok: false; error: string }>,
    exito: { title: string; description?: string }
  ) {
    setProcesando(id);
    try {
      const result = await ejecutar();
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo", description: result.error });
        return;
      }
      showToast({ variant: "success", ...exito });
      await refresh();
      if (abierto) await cargarDetalle(abierto);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-bold text-parchment">CACHUDOBET · Rondas</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Publica una ronda, deja que se llene de tickets y gira la ruleta. El ganador lo
          elige y lo paga Postgres: acá solo se dispara.
        </p>

        <FormularioRonda onGuardado={refresh} showToast={showToast} />

        <ConfigPanel config={config} onGuardado={setConfig} showToast={showToast} />

        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">Rondas</h2>

          {rondas === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : rondas.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no hay ninguna ronda. Crea la primera arriba.
            </Panel>
          ) : (
            <div className="space-y-3">
              {rondas.map(({ ronda, totalTickets, participantes }) => {
                const reparto = repartoDelPozo(ronda.pozo_total, ronda.porcentaje_premio);
                const premio = ronda.premio_monto ?? reparto.premio;
                const comision = ronda.comision_monto ?? reparto.comision;
                const enCurso = procesando === ronda.id;

                return (
                  <Panel key={ronda.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-semibold text-parchment">
                          {numeroRonda(ronda.numero)} · {ronda.nombre}
                        </p>
                        {ronda.premio_concepto ? (
                          <p className="mt-0.5 text-sm text-parchment/50">
                            {ronda.premio_concepto}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={clsx(
                          "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                          ronda.estado === "abierta"
                            ? "border-win-glow/50 bg-win/10 text-win-glow"
                            : ronda.estado === "girando"
                              ? "border-gold bg-gold/15 text-gold"
                              : "border-gold-dark text-parchment/45"
                        )}
                      >
                        {ESTADO_RONDA_LABEL[ronda.estado]}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gold-dark/40 pt-3 sm:grid-cols-5">
                      <Dato label="Pozo" valor={`S/${soles(ronda.pozo_total)}`} tono="gold" />
                      <Dato label="Premio" valor={`S/${soles(premio)}`} />
                      <Dato label="Casa" valor={`S/${soles(comision)}`} tono="win" />
                      <Dato label="Tickets" valor={String(totalTickets)} />
                      <Dato label="Jugadores" valor={String(participantes)} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {ronda.estado === "borrador" || ronda.estado === "cerrada" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={enCurso || ronda.ganador_ticket_id !== null}
                          onClick={() =>
                            accion(
                              ronda.id,
                              () => cambiarEstadoRonda({ rondaId: ronda.id, estado: "abierta" }),
                              { title: "Ronda abierta", description: "Ya pueden comprar tickets." }
                            )
                          }
                          className="min-h-9 px-3 py-1 text-xs"
                        >
                          Abrir ronda
                        </Button>
                      ) : null}

                      {ronda.estado === "abierta" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={enCurso}
                          onClick={() =>
                            accion(
                              ronda.id,
                              () => cambiarEstadoRonda({ rondaId: ronda.id, estado: "cerrada" }),
                              { title: "Ronda cerrada", description: "Ya no entran más tickets." }
                            )
                          }
                          className="min-h-9 px-3 py-1 text-xs"
                        >
                          Cerrar ronda
                        </Button>
                      ) : null}

                      {ronda.estado === "cerrada" ? (
                        <Button
                          type="button"
                          disabled={enCurso || totalTickets === 0}
                          onClick={() =>
                            accion(ronda.id, () => girarRuleta(ronda.id), {
                              title: "¡Girando!",
                              description: "Todos los jugadores están viendo el mismo giro.",
                            })
                          }
                          className="min-h-9 px-4 py-1 text-xs"
                        >
                          {enCurso ? "Girando…" : "🎡 Girar ruleta"}
                        </Button>
                      ) : null}

                      {ronda.estado === "girando" ? (
                        <Button
                          type="button"
                          variant="win"
                          disabled={enCurso}
                          onClick={() =>
                            accion(ronda.id, () => finalizarRonda(ronda.id), {
                              title: "Ronda finalizada",
                            })
                          }
                          className="min-h-9 px-3 py-1 text-xs"
                        >
                          Finalizar ronda
                        </Button>
                      ) : null}

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setAbierto(abierto === ronda.id ? null : ronda.id)}
                        className="min-h-9 px-3 py-1 text-xs"
                      >
                        {abierto === ronda.id ? "Ocultar" : "Ver participantes"}
                      </Button>
                    </div>

                    {ronda.ganador_ticket_id && detalle?.ganador && abierto === ronda.id ? (
                      <p className="mt-3 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold-light">
                        🏆 Ganó <strong>{detalle.ganador.nickname}</strong> con el ticket #
                        {detalle.ganador.codigo}
                      </p>
                    ) : null}

                    {abierto === ronda.id ? (
                      <DetalleRonda
                        rondaId={ronda.id}
                        detalle={detalle}
                        aceptaTickets={ronda.estado === "borrador" || ronda.estado === "abierta"}
                        onCambio={async () => {
                          await Promise.all([refresh(), cargarDetalle(ronda.id)]);
                        }}
                        showToast={showToast}
                      />
                    ) : null}
                  </Panel>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function FormularioRonda({
  onGuardado,
  showToast,
}: {
  onGuardado: () => Promise<void>;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [nombre, setNombre] = useState("");
  const [premio, setPremio] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setGuardando(true);
    try {
      const result = await guardarRonda({ nombre, premioConcepto: premio || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({
        variant: "success",
        title: `Ronda ${numeroRonda(result.data.numero)} creada`,
        description: "Ábrela para que puedan comprar tickets.",
      });
      setNombre("");
      setPremio("");
      await onGuardado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Panel className="mt-8 p-5">
      <h2 className="font-display text-lg font-semibold text-gold-light">Nueva ronda</h2>
      <form onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="nombre-ronda" className="text-[11px] uppercase tracking-wide text-parchment/40">
            Nombre
          </label>
          <input
            id="nombre-ronda"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ronda del viernes"
            className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          />
        </div>
        <div>
          <label htmlFor="premio-ronda" className="text-[11px] uppercase tracking-wide text-parchment/40">
            Premio / concepto (opcional)
          </label>
          <input
            id="premio-ronda"
            value={premio}
            onChange={(e) => setPremio(e.target.value)}
            placeholder="El 80% del pozo"
            className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={guardando || nombre.trim().length < 3}>
            {guardando ? "Creando…" : "Crear ronda"}
          </Button>
        </div>
      </form>
      {error ? <p className="mt-3 text-sm text-lose-glow">{error}</p> : null}
    </Panel>
  );
}

function ConfigPanel({
  config,
  onGuardado,
  showToast,
}: {
  config: CachudobetConfig | null;
  onGuardado: (c: CachudobetConfig) => void;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [abierto, setAbierto] = useState(false);
  const [precio, setPrecio] = useState("");
  const [porcentaje, setPorcentaje] = useState("");
  const [multiplicador, setMultiplicador] = useState("");
  const [minimo, setMinimo] = useState("");
  const [maximo, setMaximo] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [guardando, setGuardando] = useState(false);

  function abrir() {
    if (!config) return;
    setPrecio(String(config.precio_ticket));
    setPorcentaje(String(config.porcentaje_premio));
    setMultiplicador(String(config.cara_sello_multiplicador));
    setMinimo(String(config.cara_sello_min));
    setMaximo(String(config.cara_sello_max));
    setAbierto(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setGuardando(true);
    try {
      const result = await guardarConfig({
        precioTicket: Number(precio),
        porcentajePremio: Number(porcentaje),
        caraSelloMultiplicador: Number(multiplicador),
        caraSelloMin: Number(minimo),
        caraSelloMax: Number(maximo),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onGuardado(result.data);
      showToast({ variant: "success", title: "Configuración guardada" });
      setAbierto(false);
    } finally {
      setGuardando(false);
    }
  }

  if (!config) return null;

  return (
    <Panel className="mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-gold-light">Configuración</h2>
          <p className="mt-1 text-sm text-parchment/55">
            Ticket S/{soles(config.precio_ticket)} · Premio {config.porcentaje_premio}% / Casa{" "}
            {config.porcentaje_casa}% · Cara o sello {config.cara_sello_multiplicador}x (S/
            {soles(config.cara_sello_min)}–S/{soles(config.cara_sello_max)})
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => (abierto ? setAbierto(false) : abrir())}
          className="min-h-9 px-3 py-1 text-xs"
        >
          {abierto ? "Cancelar" : "Editar"}
        </Button>
      </div>

      {abierto ? (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-3">
          <CampoNumero label="Precio del ticket" valor={precio} onChange={setPrecio} step="0.5" />
          <CampoNumero label="% al ganador" valor={porcentaje} onChange={setPorcentaje} step="1" />
          <CampoNumero
            label="Multiplicador cara/sello"
            valor={multiplicador}
            onChange={setMultiplicador}
            step="0.05"
          />
          <CampoNumero label="Mínimo cara/sello" valor={minimo} onChange={setMinimo} step="1" />
          <CampoNumero label="Máximo cara/sello" valor={maximo} onChange={setMaximo} step="1" />
          <div className="flex items-end">
            <Button type="submit" disabled={guardando} className="min-h-11 w-full text-xs">
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
          <p className="text-[11px] text-parchment/40 sm:col-span-3">
            La casa se queda con el complemento del porcentaje al ganador. Los cambios NO
            afectan a las rondas ya creadas: cada una guarda con qué números se jugó.
          </p>
          {error ? <p className="text-sm text-lose-glow sm:col-span-3">{error}</p> : null}
        </form>
      ) : null}
    </Panel>
  );
}

function DetalleRonda({
  rondaId,
  detalle,
  aceptaTickets,
  onCambio,
  showToast,
}: {
  rondaId: string;
  detalle: RondaResumen | null;
  aceptaTickets: boolean;
  onCambio: () => Promise<void>;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [usuarioId, setUsuarioId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    if (!aceptaTickets) return;
    getUsuarios().then((r) => setUsuarios(r.ok ? r.data : []));
  }, [aceptaTickets]);

  async function handleAgregar() {
    setAgregando(true);
    try {
      const result = await agregarTickets({
        rondaId,
        usuarioId,
        cantidad: Number(cantidad),
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo agregar", description: result.error });
        return;
      }
      showToast({
        variant: "success",
        title: `${result.data.length} tickets agregados`,
        description: "Sin descontar saldo — se pagaron por fuera.",
      });
      setCantidad("1");
      await onCambio();
    } finally {
      setAgregando(false);
    }
  }

  return (
    <div className="mt-4 border-t border-gold-dark/40 pt-4">
      {detalle === null ? (
        <p className="text-sm text-parchment/50">Cargando participantes…</p>
      ) : detalle.participantes.length === 0 ? (
        <p className="text-sm text-parchment/45">Nadie ha comprado tickets todavía.</p>
      ) : (
        <ul className="space-y-2">
          {detalle.participantes.map((p) => (
            <li
              key={p.usuarioId}
              className="flex items-center justify-between gap-3 rounded-md bg-obsidian/40 px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm text-parchment/80">{p.nickname}</span>
              <span className="shrink-0 text-xs text-parchment/50">
                {p.tickets} tickets ·{" "}
                {detalle.totalTickets > 0
                  ? Math.round((p.tickets / detalle.totalTickets) * 1000) / 10
                  : 0}
                %
              </span>
            </li>
          ))}
        </ul>
      )}

      {aceptaTickets ? (
        <div className="mt-4 rounded-md border border-gold-dark/60 bg-obsidian/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-parchment/40">
            Agregar tickets a mano (pagados por fuera)
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              aria-label="Jugador"
              className="min-h-11 flex-1 rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              <option value="">Elige un jugador…</option>
              {(usuarios ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nickname}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={500}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              aria-label="Cantidad de tickets"
              className="min-h-11 w-24 rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />
            <Button
              type="button"
              variant="ghost"
              disabled={agregando || !usuarioId || Number(cantidad) < 1}
              onClick={handleAgregar}
              className="min-h-11 px-3 py-1 text-xs"
            >
              {agregando ? "…" : "Agregar"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CampoNumero({
  label,
  valor,
  onChange,
  step,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  step: string;
}) {
  return (
    <label className="block text-[11px] uppercase tracking-wide text-parchment/40">
      {label}
      <input
        type="number"
        step={step}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
      />
    </label>
  );
}

function Dato({
  label,
  valor,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  tono?: "neutro" | "gold" | "win";
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-parchment/40">{label}</p>
      <p
        className={clsx(
          "font-display text-lg font-bold",
          tono === "gold" ? "text-gold-light" : tono === "win" ? "text-win-glow" : "text-parchment"
        )}
      >
        {valor}
      </p>
    </div>
  );
}

export default function AdminRuletaPage() {
  return (
    <RequireAdmin>
      <AdminRuletaContent />
    </RequireAdmin>
  );
}
