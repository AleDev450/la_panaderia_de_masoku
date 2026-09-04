"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { getSolicitudesTelefono } from "@/actions/perfil";
import { getRecargas } from "@/actions/recargas";
import {
  getMetricas,
  getMovimientosUsuarios,
  getResumenDiario,
  getUsuarios,
} from "@/actions/admin";
import { getSorteos } from "@/actions/sorteos";
import { getRondas } from "@/actions/ruleta";
import { getMetricasCaraSello } from "@/actions/caraSello";
import { AdminMetricas, ResumenDia } from "@/lib/supabase/types";
import { hoyIsoEnPeru } from "@/lib/eventos";
import { HojaExcel, descargarXlsx } from "@/lib/xlsx";

function AdminHomeContent() {
  const [metricas, setMetricas] = useState<AdminMetricas | null>(null);
  const [telefonos, setTelefonos] = useState<number | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [resumen, setResumen] = useState<ResumenDia[] | null>(null);
  const [sorteosActivos, setSorteosActivos] = useState<number | null>(null);
  const [rondasAbiertas, setRondasAbiertas] = useState<number | null>(null);
  const [jugadasCaraSello, setJugadasCaraSello] = useState<number | null>(null);

  // Rango del cuadro y de la descarga. Arranca en el mes en curso
  // (calendario de Perú) y lo mueve el propio panel.
  const hoyIso = hoyIsoEnPeru();
  const primerDiaMes = `${hoyIso.slice(0, 7)}-01`;
  const [desde, setDesde] = useState(primerDiaMes);
  const [hasta, setHasta] = useState(hoyIso);

  useEffect(() => {
    getMetricas().then((result) => {
      if (result.ok) setMetricas(result.data);
    });
    getSolicitudesTelefono().then((result) => {
      if (result.ok) {
        setTelefonos(result.data.filter((s) => s.solicitud.estado === "pendiente").length);
      }
    });
    getRecargas().then((result) => {
      if (result.ok) {
        setPendientes(result.data.filter((r) => r.recarga.estado === "pendiente").length);
      }
    });
    getSorteos().then((result) => {
      // Igual que el resumen: si 0037 todavía no corrió, 0 en vez de "—"
      // colgado para siempre.
      setSorteosActivos(result.ok ? result.data.filter((s) => s.sorteo.activo).length : 0);
    });
    getRondas().then((result) => {
      // Igual que el resto: si 0048 todavía no corrió, 0 en vez de "—"
      // colgado para siempre.
      setRondasAbiertas(
        result.ok
          ? result.data.filter((r) =>
              ["abierta", "cerrada", "girando"].includes(r.ronda.estado)
            ).length
          : 0
      );
    });
    getMetricasCaraSello().then((result) => {
      setJugadasCaraSello(result.ok ? result.data.jugadas : 0);
    });
    getResumenDiario(desde, hasta).then((result) => {
      // Si el RPC todavía no existe (migración 0034 sin correr), se muestra
      // vacío en vez de quedarse en "Cargando…" para siempre.
      setResumen(result.ok ? result.data : []);
    });
  }, [desde, hasta]);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-bold text-parchment">
          Panel CACHUDOBET
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          Movimiento del día y accesos de administración.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">Hoy</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metrica
              label="Depositado"
              valor={metricas ? `S/${metricas.depositado_hoy}` : "—"}
              detalle="Recargas + ingresos registrados"
            />
            <Metrica
              label="Pagué en Yape"
              valor={metricas ? `S/${metricas.retirado_hoy}` : "—"}
              detalle={
                metricas
                  ? metricas.retiros_pagados_hoy === 1
                    ? "1 retiro yapeado hoy"
                    : `${metricas.retiros_pagados_hoy} retiros yapeados hoy`
                  : "Retiros yapeados hoy"
              }
              tono="lose"
            />
            <Metrica
              label="Pagado"
              valor={metricas ? `S/${metricas.pagado_hoy}` : "—"}
              detalle="Premios a ganadores"
              tono="lose"
            />
            {/* Con apuestas fake de por medio la ganancia puede ser negativa
                (ver 0036), así que el color sigue al signo y no al rótulo. */}
            <Metrica
              label="Ganancia"
              valor={metricas ? `S/${metricas.ganancia_hoy}` : "—"}
              detalle="Resultado del día"
              tono={metricas && metricas.ganancia_hoy < 0 ? "lose" : "win"}
            />
            <Metrica
              label="Ganancia total"
              valor={metricas ? `S/${metricas.ganancia_total}` : "—"}
              detalle="Histórico acumulado"
              tono={metricas && metricas.ganancia_total < 0 ? "lose" : "win"}
            />
          </div>
        </section>

        <GananciaPorJuego metricas={metricas} />

        <ResumenDiario
          resumen={resumen}
          desde={desde}
          hasta={hasta}
          onDesde={setDesde}
          onHasta={setHasta}
          metricas={metricas}
        />

        {metricas ? (
          <section className="mt-6">
            <Panel className="border-gold-light/50 bg-gold/5 p-5">
              <p className="text-[11px] uppercase tracking-wide text-parchment/40">
                Reconciliación de caja
              </p>
              {/* Yape y efectivo van juntos en un solo número, a pedido: el
                  efectivo nunca entra al teléfono, así que "en Yape" sería
                  mentira (0044). */}
              <p className="mt-1 font-display text-2xl font-bold text-gold-light">
                Deberías tener: S/{metricas.yape_esperado}
              </p>
              <p className="text-[11px] text-parchment/40">
                Entre el Yape y el efectivo que tengas en mano
              </p>
              {/* Se muestran los INSUMOS y no una derivación: la línea
                  anterior armaba "Ganancia + Saldos − Pagos + Ajustes", y esa
                  identidad es falsa cuando hay pagos manuales que restan de
                  la ganancia — el pago quedaba restado dos veces (0043). */}
              <p className="mt-2 text-xs text-parchment/60">
                = Recargas S/{metricas.recargas_total} + Ingresos registrados
                S/{metricas.ingresos_manuales_total} − Retiros pagados
                S/{metricas.retiros_total} − Pagos manuales
                S/{metricas.pagos_manuales_total}
                {metricas.ajustes_yape_total !== 0
                  ? ` ${metricas.ajustes_yape_total > 0 ? "+" : "−"} Ajustes S/${Math.abs(metricas.ajustes_yape_total)}`
                  : ""}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gold-dark/40 pt-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-parchment/40">
                    De los jugadores
                  </p>
                  <p className="font-display text-lg font-bold text-parchment">
                    S/{metricas.saldos_usuarios_total}
                  </p>
                  <p className="text-[11px] text-parchment/40">Se lo debes</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-parchment/40">
                    Tuyo
                  </p>
                  {/* Lo que queda si le pagas a todos. Siempre cuadra, sin
                      derivar nada — y NO es lo mismo que la ganancia. */}
                  <p
                    className={`font-display text-lg font-bold ${
                      metricas.yape_esperado - metricas.saldos_usuarios_total < 0
                        ? "text-lose-glow"
                        : "text-win-glow"
                    }`}
                  >
                    S/
                    {Math.round(
                      (metricas.yape_esperado - metricas.saldos_usuarios_total) * 100
                    ) / 100}
                  </p>
                  <p className="text-[11px] text-parchment/40">
                    Lo que queda si les pagas a todos
                  </p>
                </div>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-parchment/40">
                Tu <strong className="text-parchment/60">ganancia</strong> del
                negocio es S/{metricas.ganancia_total} — la comisión de los tres juegos
                menos los pagos a personal. Es otro número: no todo lo que te queda en
                caja es ganancia, ni al revés.
                {metricas.ajustes_saldo_total !== 0
                  ? ` Además diste S/${metricas.ajustes_saldo_total} de saldo con "Ajustar saldo", que no fue plata que entró: sale de lo tuyo.`
                  : ""}
              </p>

              <Link
                href="/bakery/pagos"
                className="mt-3 inline-block text-xs font-semibold text-gold-light underline"
              >
                Ver historial de pagos, ajustes y registrar uno nuevo →
              </Link>
            </Panel>
          </section>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Tarjeta
            href="/bakery/titulos"
            titulo="Títulos de apuesta"
            descripcion="Publica títulos, abre o cierra apuestas y declara resultados."
            valor={metricas?.eventos_abiertos ?? null}
            unidad="abiertos"
          />
          <Tarjeta
            href="/bakery/ruleta"
            titulo="🎡 Ruleta CACHUDOBET"
            descripcion="Crea rondas, mira el pozo y gira la ruleta."
            valor={rondasAbiertas}
            unidad="rondas en juego"
          />
          <Tarjeta
            href="/bakery/cara-o-sello"
            titulo="🪙 Cara o sello"
            descripcion="Jugadas, volumen y resultado de la casa."
            valor={jugadasCaraSello}
            unidad="jugadas"
          />
          <Tarjeta
            href="/bakery/recargas"
            titulo="Recargas"
            descripcion="Revisa comprobantes, corrige montos y acredita saldo."
            valor={pendientes}
            unidad="pendientes"
          />
          <Tarjeta
            href="/bakery/retiros"
            titulo="Retiros"
            descripcion="Yapea a los jugadores y marca como pagado."
            valor={metricas?.retiros_pendientes ?? null}
            unidad="por pagar"
          />
          <Tarjeta
            href="/bakery/usuarios"
            titulo="Usuarios"
            descripcion="Saldos, puntos y suspensión de cuentas."
            valor={metricas?.usuarios_total ?? null}
            unidad={
              metricas && metricas.usuarios_baneados > 0
                ? `registrados · ${metricas.usuarios_baneados} suspendidos`
                : "registrados"
            }
          />
          <Tarjeta
            href="/bakery/telefonos"
            titulo="Cambios de teléfono"
            descripcion="Aprueba o rechaza solicitudes de cambio de número."
            valor={telefonos}
            unidad="pendientes"
          />
          <Tarjeta
            href="/bakery/pagos"
            titulo="Pagos manuales"
            descripcion="Retiros propios o pagos a trabajadores, con historial."
            valor={metricas ? metricas.pagos_manuales_total : null}
            unidad="S/ pagados en total"
          />
          <Tarjeta
            href="/bakery/sorteos"
            titulo="Sorteos"
            descripcion="Publica un sorteo, revisa inscritos y marca ganadores."
            valor={sorteosActivos}
            unidad="abiertos"
          />
        </div>
      </main>
    </>
  );
}

const fmt = (n: number) => n.toFixed(2);
/** Las celdas van como número (sumables en Excel), pero sin arrastrar la
 * basura de coma flotante de sumar decimales. */
const redondear = (n: number) => Math.round(n * 100) / 100;

function fechaCorta(iso: string) {
  // T12 evita que el huso corra el día al formatear.
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Descarga el libro de Excel del día: el mes día a día, quiénes tienen
 * saldo ahora mismo, y el desglose de qué parte del Yape es tuya.
 *
 * La hoja de saldos se pide recién al hacer clic y no al cargar el panel:
 * es la lista completa de usuarios y solo hace falta cuando se descarga.
 */
async function descargarLibro(
  filas: ResumenDia[],
  desde: string,
  hasta: string,
  metricas: AdminMetricas | null
): Promise<string | null> {
  const t = filas.reduce(
    (acc, d) => ({
      dep: acc.dep + d.depositado,
      apo: acc.apo + d.apostado,
      pag: acc.pag + d.pagado,
      ret: acc.ret + d.retirado,
      gan: acc.gan + d.ganancia_real,
      par: acc.par + d.comision_partidas,
      rul: acc.rul + d.comision_ruleta,
      mon: acc.mon + d.comision_cara_sello,
    }),
    { dep: 0, apo: 0, pag: 0, ret: 0, gan: 0, par: 0, rul: 0, mon: 0 }
  );
  // El "acumulado en Yape" ya es un running total: el total del mes es el del
  // día más reciente (filas viene ordenado del más nuevo al más viejo).
  const yapeActual = filas[0]?.yape_acumulado ?? 0;

  const hojaMes: HojaExcel = {
    nombre: `Dia a dia`,
    encabezados: [
      "Fecha",
      "Ingreso (S/)",
      "Apostaron (S/)",
      "Se pago (S/)",
      "Yapee en retiros (S/)",
      "Me queda (S/)",
      "Ganancia real (S/)",
      // Desglose de la ganancia (0052): en la hoja sí entra completo, que en
      // la pantalla haría la tabla impasable de ancha.
      "De partidas (S/)",
      "De ruleta (S/)",
      "De cara o sello (S/)",
      "Acumulado en Yape (S/)",
    ],
    filas: [
      ...filas.map((d) => [
        d.fecha,
        d.depositado,
        d.apostado,
        d.pagado,
        d.retirado,
        redondear(d.depositado - d.pagado - d.retirado),
        d.ganancia_real,
        d.comision_partidas,
        d.comision_ruleta,
        d.comision_cara_sello,
        d.yape_acumulado,
      ]),
      [
        "TOTAL",
        redondear(t.dep),
        redondear(t.apo),
        redondear(t.pag),
        redondear(t.ret),
        redondear(t.dep - t.pag - t.ret),
        redondear(t.gan),
        redondear(t.par),
        redondear(t.rul),
        redondear(t.mon),
        yapeActual,
      ],
    ],
  };

  const usuarios = await getUsuarios();
  if (!usuarios.ok) return usuarios.error;

  // Solo los que tienen algo: la lista sirve para saber a quién le debes
  // cuánto, y una fila en cero no dice nada. El saldo fake va en su propia
  // columna y NO suma al total — no es plata que debas.
  const conSaldo = usuarios.data
    .filter((u) => u.saldoDisponible + u.saldoRetenido > 0)
    .sort((a, b) => b.saldoDisponible + b.saldoRetenido - (a.saldoDisponible + a.saldoRetenido));

  const totalReal = conSaldo.reduce((n, u) => n + u.saldoDisponible + u.saldoRetenido, 0);
  const totalFake = conSaldo.reduce((n, u) => n + u.saldoFake + u.saldoFakeRetenido, 0);

  const hojaSaldos: HojaExcel = {
    nombre: "Saldos de jugadores",
    encabezados: [
      "Jugador",
      "Nombre",
      "Telefono",
      "Disponible (S/)",
      "En juego (S/)",
      "Le debes (S/)",
      "Saldo fake (S/)",
      "Deposito historico (S/)",
    ],
    filas: [
      ...conSaldo.map((u) => [
        u.nickname,
        u.fullName ?? "",
        u.phone ?? "",
        u.saldoDisponible,
        u.saldoRetenido,
        redondear(u.saldoDisponible + u.saldoRetenido),
        redondear(u.saldoFake + u.saldoFakeRetenido),
        u.depositadoTotal,
      ]),
      ["TOTAL", "", "", "", "", redondear(totalReal), redondear(totalFake), ""],
    ],
  };

  const hojaMiDinero: HojaExcel = {
    nombre: "Mi dinero (Yape)",
    encabezados: ["Concepto", "Monto (S/)", "Que es"],
    filas: metricas
      ? [
          [
            "En el Yape deberias tener",
            metricas.yape_esperado,
            "Todo lo que deberia haber en el telefono ahora",
          ],
          [
            "  De eso, de los jugadores",
            metricas.saldos_usuarios_total,
            "Se lo debes: es su saldo, disponible y en juego",
          ],
          [
            "  De eso, TUYO",
            redondear(metricas.yape_esperado - metricas.saldos_usuarios_total),
            "Lo que queda en el telefono si les pagas a todos",
          ],
          [
            "Tu ganancia del negocio",
            metricas.ganancia_total,
            "Comision menos pagos a personal. OTRO numero: no es lo que queda en el Yape",
          ],
          [
            "Pagos ya realizados",
            -metricas.pagos_manuales_total,
            "Retiros tuyos y pagos a trabajadores que ya salieron del Yape",
          ],
          [
            "Ajustes manuales",
            metricas.ajustes_yape_total,
            "Correcciones para cuadrar el numero con el telefono",
          ],
          [
            "Ingresos registrados a mano",
            metricas.ingresos_manuales_total,
            "Efectivo y demas plata que entro sin pasar por una recarga",
          ],
          [
            "Saldo fake en circulacion",
            metricas.saldo_fake_total,
            "NO es plata: no entra en el Yape y no se lo debes a nadie",
          ],
        ]
      : [["Sin datos", 0, "No se pudieron cargar las metricas"]],
  };

  // Historial por jugador: de dónde salió cada sol y a dónde se fue.
  const movimientos = await getMovimientosUsuarios(desde, hasta);
  if (!movimientos.ok) return movimientos.error;

  const hojaHistorial: HojaExcel = {
    nombre: "Historial de jugadores",
    encabezados: [
      "Fecha",
      "Hora",
      "Jugador",
      "Tipo",
      "Detalle",
      "Monto (S/)",
      "Es fake",
    ],
    filas: movimientos.data.map((m) => {
      const d = new Date(m.fecha);
      return [
        d.toLocaleDateString("es-PE", { timeZone: "America/Lima" }),
        d.toLocaleTimeString("es-PE", {
          timeZone: "America/Lima",
          hour: "2-digit",
          minute: "2-digit",
        }),
        m.nickname,
        m.tipo,
        m.detalle,
        redondear(m.monto),
        m.esFake ? "SI" : "",
      ];
    }),
  };

  descargarXlsx(`cachudobet-${desde}_a_${hasta}.xlsx`, [
    hojaMes,
    hojaSaldos,
    hojaHistorial,
    hojaMiDinero,
  ]);
  return null;
}

/**
 * De dónde sale cada sol de ganancia.
 *
 * Existe porque "Ganancia: S/240" no dice si el negocio lo está haciendo la
 * ruleta, las partidas o la moneda — y esas tres se arreglan de formas
 * distintas cuando una va mal. Partidas puede salir NEGATIVA cuando hubo
 * saldo fake de por medio (0036): ahí la casa sí arriesga.
 */
function GananciaPorJuego({ metricas }: { metricas: AdminMetricas | null }) {
  const fuentes = metricas
    ? [
        {
          nombre: "Partidas y blackjack",
          detalle: "0.20 por sol emparejado",
          hoy: metricas.ganancia_partidas_hoy,
          total: metricas.ganancia_partidas_total,
        },
        {
          nombre: "Ruleta",
          detalle: "Lo que no se llevó el ganador",
          hoy: metricas.ganancia_ruleta_hoy,
          total: metricas.ganancia_ruleta_total,
        },
        {
          nombre: "Cara o sello",
          detalle: "Apostado − pagado",
          hoy: metricas.ganancia_cara_sello_hoy,
          total: metricas.ganancia_cara_sello_total,
        },
      ]
    : [];

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
        De dónde viene la ganancia
      </h2>
      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-gold-dark/40 text-left text-[11px] uppercase tracking-wide text-parchment/40">
              <th className="px-4 py-2 font-semibold">Juego</th>
              <th className="px-4 py-2 text-right font-semibold">Hoy</th>
              <th className="px-4 py-2 text-right font-semibold">Histórico</th>
            </tr>
          </thead>
          <tbody>
            {metricas === null ? (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-parchment/50">
                  Cargando…
                </td>
              </tr>
            ) : (
              <>
                {fuentes.map((f) => (
                  <tr key={f.nombre} className="border-b border-gold-dark/20">
                    <td className="px-4 py-2.5">
                      <span className="text-parchment/85">{f.nombre}</span>
                      <span className="block text-[11px] text-parchment/40">{f.detalle}</span>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right ${f.hoy < 0 ? "text-lose-glow" : "text-parchment/70"}`}
                    >
                      S/{fmt(f.hoy)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold ${
                        f.total < 0 ? "text-lose-glow" : "text-win-glow"
                      }`}
                    >
                      S/{fmt(f.total)}
                    </td>
                  </tr>
                ))}
                {metricas.pagos_personal_total !== 0 ? (
                  <tr className="border-b border-gold-dark/20">
                    <td className="px-4 py-2.5">
                      <span className="text-parchment/85">Pagos a personal</span>
                      <span className="block text-[11px] text-parchment/40">
                        Se restan de la ganancia
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-lose-glow">
                      −S/{fmt(metricas.pagos_personal_hoy)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-lose-glow">
                      −S/{fmt(metricas.pagos_personal_total)}
                    </td>
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
          {metricas ? (
            <tfoot>
              <tr className="border-t border-gold-dark/50 font-bold text-parchment">
                <td className="px-4 py-2.5">TOTAL</td>
                <td
                  className={`px-4 py-2.5 text-right ${metricas.ganancia_hoy < 0 ? "text-lose-glow" : "text-parchment"}`}
                >
                  S/{fmt(metricas.ganancia_hoy)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right ${
                    metricas.ganancia_total < 0 ? "text-lose-glow" : "text-win-glow"
                  }`}
                >
                  S/{fmt(metricas.ganancia_total)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </Panel>
      <p className="mt-2 text-[11px] leading-relaxed text-parchment/40">
        <strong className="text-parchment/60">Partidas</strong> puede salir negativa: es el
        único juego donde la casa arriesga, por el saldo fake (ver 0036). En{" "}
        <strong className="text-parchment/60">ruleta</strong> y{" "}
        <strong className="text-parchment/60">cara o sello</strong> la comisión sale siempre
        de plata de los jugadores, así que nunca baja de cero.
      </p>
    </section>
  );
}

function ResumenDiario({
  resumen,
  desde,
  hasta,
  onDesde,
  onHasta,
  metricas,
}: {
  resumen: ResumenDia[] | null;
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  metricas: AdminMetricas | null;
}) {
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  async function handleDescargar() {
    if (!resumen) return;
    setDescargando(true);
    setErrorDescarga(null);
    try {
      setErrorDescarga(await descargarLibro(resumen, desde, hasta, metricas));
    } finally {
      setDescargando(false);
    }
  }

  const total = (resumen ?? []).reduce(
    (acc, d) => ({
      dep: acc.dep + d.depositado,
      apo: acc.apo + d.apostado,
      pag: acc.pag + d.pagado,
      ret: acc.ret + d.retirado,
      gan: acc.gan + d.ganancia_real,
    }),
    { dep: 0, apo: 0, pag: 0, ret: 0, gan: 0 }
  );
  // El acumulado en Yape ya es running total: el "actual" es el del día más
  // reciente (resumen viene del más nuevo al más viejo).
  const yapeActual = resumen && resumen.length > 0 ? resumen[0].yape_acumulado : 0;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-gold-light">Día a día</h2>

        {/* El rango manda sobre el cuadro Y sobre la descarga: tener uno
            mostrando el mes y el otro exportando otra cosa se presta a
            mandar el Excel equivocado. */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] uppercase tracking-wide text-parchment/40">
            Desde
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => onDesde(e.target.value)}
              className="mt-1 block min-h-9 rounded-md border border-gold-dark bg-obsidian/60 px-2 py-1 text-xs text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />
          </label>
          <label className="text-[11px] uppercase tracking-wide text-parchment/40">
            Hasta
            <input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => onHasta(e.target.value)}
              className="mt-1 block min-h-9 rounded-md border border-gold-dark bg-obsidian/60 px-2 py-1 text-xs text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />
          </label>
        <Button
          type="button"
          variant="ghost"
          disabled={!resumen || resumen.length === 0 || descargando}
          onClick={handleDescargar}
          className="min-h-9 px-3 py-1 text-xs"
        >
          {descargando ? "Armando el Excel…" : "Descargar Excel"}
        </Button>
        </div>
      </div>

      {errorDescarga ? (
        <p className="mb-3 text-xs text-lose-glow">
          No se pudo armar la hoja de saldos: {errorDescarga}
        </p>
      ) : null}

      {resumen === null ? (
        <p className="text-sm text-parchment/50">Cargando…</p>
      ) : resumen.length === 0 ? (
        <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
          Sin movimiento este mes todavía.
        </Panel>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-gold-dark/40 text-left text-[11px] uppercase tracking-wide text-parchment/40">
                <th className="px-3 py-2 font-semibold">Fecha</th>
                <th className="px-3 py-2 text-right font-semibold">Ingreso</th>
                <th className="px-3 py-2 text-right font-semibold">Apostaron</th>
                <th className="px-3 py-2 text-right font-semibold">Se pagó</th>
                <th className="px-3 py-2 text-right font-semibold">Yapeé (retiros)</th>
                <th className="px-3 py-2 text-right font-semibold">Me queda</th>
                <th className="px-3 py-2 text-right font-semibold">Ganancia real</th>
                <th className="px-3 py-2 text-right font-semibold">Acum. Yape</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((d) => {
                const queda = d.depositado - d.pagado - d.retirado;
                return (
                  <tr key={d.fecha} className="border-b border-gold-dark/20 last:border-0">
                    <td className="px-3 py-2 capitalize text-parchment/80">{fechaCorta(d.fecha)}</td>
                    <td className="px-3 py-2 text-right text-parchment/80">S/{fmt(d.depositado)}</td>
                    <td className="px-3 py-2 text-right text-parchment/70">S/{fmt(d.apostado)}</td>
                    <td className="px-3 py-2 text-right text-lose-glow">S/{fmt(d.pagado)}</td>
                    <td className="px-3 py-2 text-right text-lose-glow">S/{fmt(d.retirado)}</td>
                    <td
                      className={`px-3 py-2 text-right ${queda < 0 ? "text-lose-glow" : "text-parchment/80"}`}
                    >
                      S/{fmt(queda)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-win-glow">
                      S/{fmt(d.ganancia_real)}
                    </td>
                    <td className="px-3 py-2 text-right text-gold-light">S/{fmt(d.yape_acumulado)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gold-dark/50 font-bold text-parchment">
                <td className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2 text-right">S/{fmt(total.dep)}</td>
                <td className="px-3 py-2 text-right text-parchment/70">S/{fmt(total.apo)}</td>
                <td className="px-3 py-2 text-right text-lose-glow">S/{fmt(total.pag)}</td>
                <td className="px-3 py-2 text-right text-lose-glow">S/{fmt(total.ret)}</td>
                <td
                  className={`px-3 py-2 text-right ${total.dep - total.pag - total.ret < 0 ? "text-lose-glow" : "text-parchment/80"}`}
                >
                  S/{fmt(total.dep - total.pag - total.ret)}
                </td>
                <td className="px-3 py-2 text-right text-win-glow">S/{fmt(total.gan)}</td>
                <td className="px-3 py-2 text-right text-gold-light">S/{fmt(yapeActual)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-parchment/40">
        <strong className="text-parchment/60">Yapeé (retiros)</strong> = retiros que pagaste ese
        día ·{" "}
        <strong className="text-parchment/60">Me queda</strong> = Ingreso − Se pagó − Yapeé ·{" "}
        <strong className="text-parchment/60">Ganancia real</strong> = comisión de los tres
        juegos (partidas, ruleta y cara o sello) menos pagos a personal ·{" "}
        <strong className="text-parchment/60">Acum. Yape</strong> = lo que deberías tener en el
        Yape al cierre de ese día.
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-parchment/40">
        Si un día baja el Acum. Yape y &quot;Yapeé&quot; está en cero, la diferencia es un pago
        manual o un ajuste — está en{" "}
        <Link href="/bakery/pagos" className="text-gold-light underline">
          Pagos y ajustes
        </Link>
        .
      </p>
    </section>
  );
}

function Metrica({
  label,
  valor,
  detalle,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  detalle: string;
  tono?: "neutro" | "win" | "lose";
}) {
  const color =
    tono === "win" ? "text-win-glow" : tono === "lose" ? "text-lose-glow" : "text-parchment";
  return (
    <Panel className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-parchment/40">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${color}`}>{valor}</p>
      <p className="mt-0.5 text-[11px] text-parchment/40">{detalle}</p>
    </Panel>
  );
}

function Tarjeta({
  href,
  titulo,
  descripcion,
  valor,
  unidad,
}: {
  href: string;
  titulo: string;
  descripcion: string;
  valor: number | null;
  unidad: string;
}) {
  return (
    <Link href={href}>
      <Panel glow className="flex h-full flex-col justify-between p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-gold-light">{titulo}</h2>
          <p className="mt-1 text-sm text-parchment/60">{descripcion}</p>
        </div>
        <p className="mt-4 font-display text-2xl font-bold text-parchment">
          {valor ?? "—"}{" "}
          <span className="text-sm font-normal text-parchment/50">{unidad}</span>
        </p>
      </Panel>
    </Link>
  );
}

export default function AdminPage() {
  return (
    <RequireAdmin>
      <AdminHomeContent />
    </RequireAdmin>
  );
}
