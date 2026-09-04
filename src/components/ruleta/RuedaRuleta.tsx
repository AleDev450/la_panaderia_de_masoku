"use client";

import { SegmentoRueda } from "@/lib/ruleta";

/**
 * La rueda. Dibuja un sector por participante, con el arco proporcional a sus
 * tickets: con 10 tickets ocupas diez veces el espacio de quien tiene 1, así
 * que la probabilidad se VE antes de que gire nada.
 *
 * Es puramente presentacional: recibe los segmentos ya calculados y los
 * grados que tiene que estar rotada en este instante. Quién gana y cuándo
 * frena se decide fuera (y, antes que eso, en Postgres).
 */

const CENTRO = 110;
const RADIO = 100;

/** Sector circular desde el centro. Los ángulos van en grados desde las 12 en
 * punto y en sentido horario, que es como se lee una ruleta. */
function sector(desde: number, hasta: number): string {
  const a1 = ((desde - 90) * Math.PI) / 180;
  const a2 = ((hasta - 90) * Math.PI) / 180;
  const x1 = CENTRO + RADIO * Math.cos(a1);
  const y1 = CENTRO + RADIO * Math.sin(a1);
  const x2 = CENTRO + RADIO * Math.cos(a2);
  const y2 = CENTRO + RADIO * Math.sin(a2);
  const arcoLargo = hasta - desde > 180 ? 1 : 0;
  return `M ${CENTRO} ${CENTRO} L ${x1} ${y1} A ${RADIO} ${RADIO} 0 ${arcoLargo} 1 ${x2} ${y2} Z`;
}

/** Dónde va la etiqueta: a 62% del radio, en el medio del arco. */
function posicionEtiqueta(desde: number, hasta: number) {
  const medio = ((desde + hasta) / 2 - 90) * (Math.PI / 180);
  const r = RADIO * 0.62;
  return { x: CENTRO + r * Math.cos(medio), y: CENTRO + r * Math.sin(medio) };
}

export function RuedaRuleta({
  segmentos,
  rotacion,
  destacado,
}: {
  segmentos: SegmentoRueda[];
  /** Grados de rotación en este instante. */
  rotacion: number;
  /** Usuario ganador, para resaltarlo cuando la rueda ya frenó. */
  destacado?: string | null;
}) {
  const vacia = segmentos.length === 0;
  const unico = segmentos.length === 1;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(88vw,26rem)]">
      {/* Flecha: marca el punto de lectura, arriba y fija. La que gira es la
          rueda, no el indicador. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 -translate-y-1"
        style={{
          borderLeft: "13px solid transparent",
          borderRight: "13px solid transparent",
          borderTop: "22px solid #f5c518",
          filter: "drop-shadow(0 2px 6px rgba(245,197,24,0.6))",
        }}
      />

      <div
        className="h-full w-full rounded-full"
        style={{
          // Sin transición de CSS: la posición la fija el frame, calculada
          // contra el reloj del servidor. Una transición pelearía con eso.
          transform: `rotate(${rotacion}deg)`,
          boxShadow: "0 0 60px -12px rgba(245,197,24,0.45)",
        }}
      >
        <svg
          viewBox="0 0 220 220"
          className="h-full w-full"
          role="img"
          aria-label={
            vacia
              ? "Ruleta sin participantes"
              : `Ruleta con ${segmentos.length} participantes`
          }
        >
          <circle cx={CENTRO} cy={CENTRO} r={RADIO + 8} fill="#0d0d10" />
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RADIO + 4}
            fill="none"
            stroke="#2c2a24"
            strokeWidth="6"
          />

          {vacia ? (
            <circle cx={CENTRO} cy={CENTRO} r={RADIO} fill="#17171c" />
          ) : unico ? (
            // Un solo participante ocupa los 360°, y un arco de 0 a 360 es un
            // path degenerado: se dibuja como círculo.
            <circle cx={CENTRO} cy={CENTRO} r={RADIO} fill={segmentos[0].color} />
          ) : (
            segmentos.map((s) => (
              <path
                key={s.usuarioId}
                d={sector(s.desde, s.hasta)}
                fill={s.color}
                stroke="#050506"
                strokeWidth="1.5"
                opacity={destacado && destacado !== s.usuarioId ? 0.35 : 1}
              />
            ))
          )}

          {/* Etiquetas solo donde entran: por debajo de ~22° el texto se
              encima y ensucia la rueda en vez de informar. */}
          {segmentos
            .filter((s) => s.hasta - s.desde >= 22 || unico)
            .map((s) => {
              const { x, y } = unico
                ? { x: CENTRO, y: CENTRO - RADIO * 0.55 }
                : posicionEtiqueta(s.desde, s.hasta);
              return (
                <text
                  key={s.usuarioId}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#050506"
                  fontSize="9"
                  fontWeight="800"
                >
                  {s.nickname.length > 11 ? `${s.nickname.slice(0, 10)}…` : s.nickname}
                </text>
              );
            })}

          <circle cx={CENTRO} cy={CENTRO} r="26" fill="#050506" stroke="#2c2a24" strokeWidth="2" />
          <text
            x={CENTRO}
            y={CENTRO}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#f5c518"
            fontSize="11"
            fontWeight="900"
          >
            CB
          </text>
        </svg>
      </div>
    </div>
  );
}
