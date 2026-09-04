"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { SalaConJugadores } from "@/actions/caraSello";
import { LadoMoneda } from "@/lib/supabase/types";
import {
  FaseMoneda,
  LADO_MONEDA_LABEL,
  faseDeLanzamiento,
  rotacionFinalMoneda,
} from "@/lib/caraSello";

/**
 * Una mesa de cara o sello, dibujada como las mesas de blackjack: dos
 * asientos enfrentados y la moneda en el medio.
 *
 * La mesa se mira EN VIVO aunque no juegues: se ve quién se enfrenta a quién
 * y se espera a que el staff lance. El jugador no tiene botón de lanzar.
 *
 * La animación se calcula contra `lanza_inicia_en`, una marca del reloj del
 * SERVIDOR, así que todas las pantallas ven caer la misma moneda en el mismo
 * instante — y quien abre la página a mitad del lanzamiento se engancha donde
 * ya iba en vez de arrancarlo de cero.
 */

const soles = (n: number) => n.toFixed(2);

export function MesaCaraSello({
  item,
  miUsuarioId,
  saldo,
  desfaseMs,
  reducirMovimiento,
  ocupado,
  onUnirse,
  onCancelar,
}: {
  item: SalaConJugadores;
  miUsuarioId?: string;
  saldo: number;
  /** Reloj del servidor menos el de este navegador. */
  desfaseMs: number;
  reducirMovimiento: boolean;
  /** Ya tengo otra mesa pendiente: no puedo entrar a esta. */
  ocupado: boolean;
  onUnirse: (salaId: string) => Promise<void>;
  onCancelar: (salaId: string) => Promise<void>;
}) {
  const { sala, creadorNickname, rivalNickname } = item;
  const [entrando, setEntrando] = useState(false);
  const [animacion, setAnimacion] = useState<FaseMoneda | null>(null);

  const inicio = sala.lanza_inicia_en ? new Date(sala.lanza_inicia_en).getTime() : null;

  useEffect(() => {
    if (inicio === null || !sala.resultado || reducirMovimiento) return;

    let frame = 0;
    const tick = () => {
      const fase = faseDeLanzamiento(Date.now() + desfaseMs - inicio, sala.resultado!);
      setAnimacion(fase);
      if (fase.fase !== "terminado") frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inicio, sala.resultado, desfaseMs, reducirMovimiento]);

  // Con movimiento reducido la moneda aparece ya caída: la información es la
  // misma, lo que se saca es el mareo.
  const fase: FaseMoneda | null =
    inicio === null || !sala.resultado
      ? null
      : reducirMovimiento
        ? { fase: "terminado", rotacion: rotacionFinalMoneda(sala.resultado) }
        : animacion;

  const revelado = fase?.fase === "terminado";
  const soyCreador = sala.creador_id === miUsuarioId;
  const soyRival = sala.rival_id === miUsuarioId;
  const juego = soyCreador || soyRival;
  const gane = juego && sala.ganador_id === miUsuarioId;
  const ladoLibre: LadoMoneda = sala.lado_creador === "cara" ? "sello" : "cara";
  const sinSaldo = saldo < sala.monto;

  async function entrar() {
    setEntrando(true);
    try {
      await onUnirse(sala.id);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <Panel
      className={clsx(
        "flex flex-col p-5",
        juego && "border-gold/50",
        fase?.fase === "girando" && "border-gold"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <EstadoMesa sala={sala} revelado={revelado} girando={fase?.fase === "girando"} />
        <span className="shrink-0 font-display text-lg font-bold text-gold-light">
          S/{soles(sala.monto)}
        </span>
      </div>

      <Asiento
        nickname={creadorNickname}
        lado={sala.lado_creador}
        esMio={soyCreador}
        ganador={revelado && sala.ganador_id === sala.creador_id}
        perdedor={revelado && sala.ganador_id !== sala.creador_id}
      />

      <div className="relative my-3 flex items-center justify-center">
        <span
          aria-hidden
          className="absolute h-px w-full bg-gradient-to-r from-transparent via-gold-dark to-transparent"
        />
        <div className="relative">
          <Moneda rotacion={fase?.rotacion ?? 0} tamaño={84} />
          {fase?.fase === "cuenta" ? (
            <span className="absolute inset-0 flex items-center justify-center font-display text-4xl font-black text-gold text-glow-gold">
              {fase.segundos}
            </span>
          ) : null}
        </div>
      </div>

      {sala.rival_id ? (
        <Asiento
          nickname={rivalNickname ?? "—"}
          lado={ladoLibre}
          esMio={soyRival}
          ganador={revelado && sala.ganador_id === sala.rival_id}
          perdedor={revelado && sala.ganador_id !== sala.rival_id}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-gold-dark bg-charcoal/30 px-4 py-3 text-center">
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-parchment/40">
            Silla libre · {LADO_MONEDA_LABEL[ladoLibre]}
          </p>
        </div>
      )}

      <div className="mt-4">
        {sala.estado === "esperando" ? (
          soyCreador ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void onCancelar(sala.id)}
              className="w-full text-xs"
            >
              Cancelar mi mesa
            </Button>
          ) : (
            <Button
              type="button"
              disabled={entrando || sinSaldo || ocupado || !miUsuarioId}
              onClick={() => void entrar()}
              className="w-full text-xs"
            >
              {entrando
                ? "Sentándote…"
                : sinSaldo
                  ? "Saldo insuficiente"
                  : ocupado
                    ? "Ya tienes una mesa"
                    : `Entrar con ${LADO_MONEDA_LABEL[ladoLibre]}`}
            </Button>
          )
        ) : sala.estado === "lista" ? (
          <p className="text-center text-[11px] leading-relaxed text-parchment/45">
            Mesa completa. El staff lanza la moneda — nadie más puede tirarla.
          </p>
        ) : revelado && sala.resultado ? (
          <p
            className={clsx(
              "text-center font-display text-sm font-black uppercase tracking-wide",
              juego ? (gane ? "text-win-glow" : "text-lose-glow") : "text-parchment/70"
            )}
          >
            {juego
              ? gane
                ? `🎉 Ganaste S/${soles(sala.premio ?? 0)}`
                : "❌ Perdiste"
              : `Salió ${LADO_MONEDA_LABEL[sala.resultado].toLowerCase()}`}
          </p>
        ) : (
          <p className="text-center text-[11px] text-parchment/45">Lanzando…</p>
        )}
      </div>
    </Panel>
  );
}

function EstadoMesa({
  sala,
  revelado,
  girando,
}: {
  sala: SalaConJugadores["sala"];
  revelado: boolean;
  girando: boolean;
}) {
  const [texto, clase] = girando
    ? ["🪙 ¡Cayendo!", "border-gold bg-gold/15 text-gold"]
    : sala.estado === "esperando"
      ? ["Busca rival", "border-win-glow/50 bg-win/10 text-win-glow"]
      : sala.estado === "lista"
        ? ["Lista para lanzar", "border-gold bg-gold/10 text-gold-light"]
        : revelado
          ? ["Terminada", "border-gold-dark text-parchment/45"]
          : ["Lanzando", "border-gold bg-gold/15 text-gold"];

  return (
    <span
      className={clsx(
        "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
        clase
      )}
    >
      {texto}
    </span>
  );
}

function Asiento({
  nickname,
  lado,
  esMio,
  ganador,
  perdedor,
}: {
  nickname: string;
  lado: LadoMoneda;
  esMio: boolean;
  ganador: boolean;
  perdedor: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border px-4 py-3 transition",
        ganador
          ? "border-win-glow/60 bg-win/10"
          : perdedor
            ? "border-gold-dark bg-charcoal/40 opacity-60"
            : "border-gold-dark/70 bg-charcoal/70"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-display text-sm font-bold text-parchment">
          {nickname}
          {esMio ? <span className="ml-1.5 text-xs text-gold">(tú)</span> : null}
        </p>
        <span
          className={clsx(
            "shrink-0 rounded-md border px-2 py-0.5 font-display text-[11px] font-bold uppercase",
            lado === "cara"
              ? "border-gold/50 text-gold"
              : "border-parchment/30 text-parchment/70"
          )}
        >
          {LADO_MONEDA_LABEL[lado]}
        </span>
      </div>
    </div>
  );
}

/** La moneda. La rotación se la manda el padre — acá no se decide nada. */
export function Moneda({ rotacion, tamaño = 160 }: { rotacion: number; tamaño?: number }) {
  return (
    <div className="[perspective:900px]">
      <div
        className="relative"
        style={{
          width: tamaño,
          height: tamaño,
          transformStyle: "preserve-3d",
          // Sin transición de CSS: la posición la fija cada frame contra el
          // reloj del servidor, y una transición pelearía con eso.
          transform: `rotateY(${rotacion}deg)`,
        }}
      >
        <CaraMoneda etiqueta="Cara" simbolo="C" tamaño={tamaño} />
        <CaraMoneda etiqueta="Sello" simbolo="S" tamaño={tamaño} reverso />
      </div>
    </div>
  );
}

function CaraMoneda({
  etiqueta,
  simbolo,
  tamaño,
  reverso = false,
}: {
  etiqueta: string;
  simbolo: string;
  tamaño: number;
  reverso?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center rounded-full"
      style={{
        backfaceVisibility: "hidden",
        transform: reverso ? "rotateY(180deg)" : undefined,
        border: `${Math.max(2, tamaño * 0.025)}px solid ${reverso ? "#cfd3dc" : "#f5c518"}`,
        background: reverso
          ? "radial-gradient(circle at 35% 30%, #6b7280, #1f2937 70%)"
          : "radial-gradient(circle at 35% 30%, #ffd95c, #b8860b 72%)",
        boxShadow: "0 18px 40px -18px rgba(0,0,0,0.9), inset 0 2px 12px rgba(255,255,255,0.25)",
      }}
    >
      <span
        className="font-display font-black leading-none"
        style={{ fontSize: tamaño * 0.34, color: reverso ? "#e5e7eb" : "#3b2c05" }}
      >
        {simbolo}
      </span>
      <span
        className="mt-1 font-display font-bold uppercase leading-none tracking-[0.2em]"
        style={{ fontSize: Math.max(8, tamaño * 0.07), color: reverso ? "#cbd5e1" : "#4a3806" }}
      >
        {etiqueta}
      </span>
    </div>
  );
}
