"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { getSolicitudesTelefono } from "@/actions/perfil";
import { getRecargas } from "@/actions/recargas";
import { getMetricas, getResumenDiario } from "@/actions/admin";
import { getSorteos } from "@/actions/sorteos";
import { AdminMetricas, ResumenDia } from "@/lib/supabase/types";
import { hoyIsoEnPeru } from "@/lib/eventos";

function AdminHomeContent() {
  const [metricas, setMetricas] = useState<AdminMetricas | null>(null);
  const [telefonos, setTelefonos] = useState<number | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [resumen, setResumen] = useState<ResumenDia[] | null>(null);
  const [sorteosActivos, setSorteosActivos] = useState<number | null>(null);

  // Mes en curso, en calendario de Perú: del día 1 a hoy.
  const hoyIso = hoyIsoEnPeru();
  const primerDiaMes = `${hoyIso.slice(0, 7)}-01`;

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
    getResumenDiario(primerDiaMes, hoyIso).then((result) => {
      // Si el RPC todavía no existe (migración 0034 sin correr), se muestra
      // vacío en vez de quedarse en "Cargando…" para siempre.
      setResumen(result.ok ? result.data : []);
    });
  }, [primerDiaMes, hoyIso]);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">
          Panel de la panadería
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          Movimiento del día y accesos de administración.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">Hoy</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metrica
              label="Depositado"
              valor={metricas ? `S/${metricas.depositado_hoy}` : "—"}
              detalle="Recargas aprobadas"
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

        <ResumenDiario resumen={resumen} mes={hoyIso.slice(0, 7)} />

        {metricas ? (
          <section className="mt-6">
            <Panel className="border-gold-light/50 bg-gold/5 p-5">
              <p className="text-[11px] uppercase tracking-wide text-parchment/40">
                Reconciliación de Yape
              </p>
              <p className="mt-1 font-fantasy text-2xl font-bold text-gold-light">
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
              {metricas.saldo_fake_total > 0 ? (
                <p className="mt-2 text-xs text-parchment/50">
                  Aparte hay S/{metricas.saldo_fake_total} de saldo fake dando
                  vueltas. No entra en este número: no se puede retirar y nunca
                  entró por Yape.
                </p>
              ) : null}
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

function fechaCorta(iso: string) {
  // T12 evita que el huso corra el día al formatear.
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/** Descarga el resumen del mes como CSV (se abre en Excel). BOM al inicio
 * para que Excel lea bien las tildes; separador coma y decimales con punto,
 * que es lo que espera el Excel en configuración de Perú. */
function descargarExcel(filas: ResumenDia[], mes: string) {
  const encabezado = [
    "Fecha",
    "Ingreso (S/)",
    "Apostaron (S/)",
    "Se pago (S/)",
    "Yapeado en retiros (S/)",
    "Me queda (S/)",
    "Ganancia real (S/)",
    "Acumulado en Yape (S/)",
  ];
  const cuerpo = filas.map((d) => [
    d.fecha,
    fmt(d.depositado),
    fmt(d.apostado),
    fmt(d.pagado),
    fmt(d.retirado),
    fmt(d.depositado - d.pagado - d.retirado),
    fmt(d.ganancia_real),
    fmt(d.yape_acumulado),
  ]);
  const t = filas.reduce(
    (acc, d) => ({
      dep: acc.dep + d.depositado,
      apo: acc.apo + d.apostado,
      pag: acc.pag + d.pagado,
      ret: acc.ret + d.retirado,
      gan: acc.gan + d.ganancia_real,
    }),
    { dep: 0, apo: 0, pag: 0, ret: 0, gan: 0 }
  );
  // El "acumulado en Yape" ya es un running total: el total del mes es el del
  // día más reciente (filas viene ordenado del más nuevo al más viejo).
  const yapeActual = filas[0]?.yape_acumulado ?? 0;
  const total = [
    "TOTAL",
    fmt(t.dep),
    fmt(t.apo),
    fmt(t.pag),
    fmt(t.ret),
    fmt(t.dep - t.pag - t.ret),
    fmt(t.gan),
    fmt(yapeActual),
  ];

  const bom = String.fromCharCode(0xfeff); // Excel lee las tildes solo con BOM.
  const texto =
    bom + [encabezado, ...cuerpo, total].map((cols) => cols.join(",")).join("\r\n");
  const blob = new Blob([texto], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resumen-${mes}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ResumenDiario({ resumen, mes }: { resumen: ResumenDia[] | null; mes: string }) {
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-fantasy text-lg font-semibold text-gold-light">Día a día · {mes}</h2>
        <Button
          type="button"
          variant="ghost"
          disabled={!resumen || resumen.length === 0}
          onClick={() => resumen && descargarExcel(resumen, mes)}
          className="min-h-9 px-3 py-1 text-xs"
        >
          Descargar Excel del mes
        </Button>
      </div>

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
        <strong className="text-parchment/60">Ganancia real</strong> = comisión del día menos
        pagos a personal ·{" "}
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
      <p className={`mt-1 font-fantasy text-2xl font-bold ${color}`}>{valor}</p>
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
      <Panel className="flex h-full flex-col justify-between p-5 transition hover:border-gold-light">
        <div>
          <h2 className="font-fantasy text-lg font-semibold text-gold-light">{titulo}</h2>
          <p className="mt-1 text-sm text-parchment/60">{descripcion}</p>
        </div>
        <p className="mt-4 font-fantasy text-2xl font-bold text-parchment">
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
