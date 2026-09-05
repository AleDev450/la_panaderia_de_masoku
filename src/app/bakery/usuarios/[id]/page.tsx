"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { ResumenUsuario, getResumenUsuario } from "@/actions/usuarios";

/**
 * Ficha de un jugador: qué apostó, qué ganó y qué perdió, en los cuatro
 * juegos y en una sola lista.
 *
 * DOS NETOS Y NO UNO. El neto total incluye lo jugado con saldo fake, que no
 * es plata que el negocio deba; el "neto real" es el único que cuenta para la
 * caja. Con un solo número, una racha ganadora hecha con fake se leería como
 * dinero que hay que pagarle a alguien.
 */

const soles = (n: number) => n.toFixed(2);

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FichaContent({ id }: { id: string }) {
  const [datos, setDatos] = useState<ResumenUsuario | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResumenUsuario(id).then((r) => {
      if (r.ok) setDatos(r.data);
      else setError(r.error);
    });
  }, [id]);

  if (error) {
    return (
      <>
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
          <Panel className="border-dashed p-8 text-center">
            <p className="text-sm text-lose-glow">{error}</p>
            <Link href="/bakery/usuarios" className="mt-3 inline-block text-xs text-gold-light underline">
              ← Volver a usuarios
            </Link>
          </Panel>
        </main>
      </>
    );
  }

  if (!datos) {
    return (
      <>
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
          <p className="text-sm text-parchment/50">Cargando…</p>
        </main>
      </>
    );
  }

  const { usuario: u, totales: t, jugadas, retiradoTotal, leQueda, dejoEnLaCasa } = datos;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/bakery/usuarios" className="text-xs text-parchment/50 underline hover:text-gold">
          ← Usuarios
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-parchment">
              {u.nickname}
              {u.baneado ? (
                <span className="ml-2 rounded-md border border-lose px-2 py-0.5 align-middle text-xs font-bold uppercase text-lose-glow">
                  Suspendido
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-xs text-parchment/45">
              {u.fullName ?? "Sin nombre"} · {u.phone ?? "sin teléfono"} · desde{" "}
              {fecha(u.createdAt)}
            </p>
          </div>
          <Link
            href="/bakery/mensajes"
            className="min-h-11 rounded-md border border-gold-dark px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wide text-parchment/70 transition hover:border-gold hover:text-gold"
          >
            Escribirle
          </Link>
        </div>

        {/* ------------------------------------------------------ dinero */}
        <section className="mt-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Su plata, de punta a punta
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Dato label="Depositó" valor={`S/${soles(u.depositadoTotal)}`} detalle="Recargas aprobadas" />
            <Dato
              label="Ganó"
              valor={`+S/${soles(t.ganado)}`}
              detalle={`${t.ganadas} jugadas`}
              tono="win"
            />
            <Dato
              label="Perdió"
              valor={`−S/${soles(t.perdido)}`}
              detalle={`${t.perdidas} jugadas`}
              tono="lose"
            />
            <Dato label="Retiró" valor={`S/${soles(retiradoTotal)}`} detalle="Ya se lo yapeaste" />
            <Dato
              label="Le queda"
              valor={`S/${soles(leQueda)}`}
              detalle={u.saldoRetenido > 0 ? `S/${soles(u.saldoRetenido)} en juego` : "Disponible"}
            />
            <Dato
              label="Generó"
              valor={`S/${soles(dejoEnLaCasa)}`}
              detalle="Depositó − retiró − le queda"
              tono={dejoEnLaCasa >= 0 ? "win" : "lose"}
            />
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-parchment/40">
            <strong className="text-parchment/60">Generó</strong> es la plata real que entró y
            ya no está ni en su bolsillo ni en su saldo.{" "}
            <strong className="text-parchment/60">No lo leas como ganancia tuya</strong>: buena
            parte se la llevaron otros jugadores al ganarle —el motor empareja entre pares— y
            solo una fracción es comisión de la casa. Si además le ajustaste el saldo a mano, el
            número se corre, porque ese movimiento mete plata que nunca entró por una recarga.
            {dejoEnLaCasa < 0
              ? " Acá está en negativo: se llevó más de lo que depositó."
              : ""}
          </p>
        </section>

        {u.saldoFake + u.saldoFakeRetenido > 0 ? (
          <p className="mt-2 text-[11px] text-parchment/40">
            Además tiene{" "}
            <strong className="text-parchment/60">
              S/{soles(u.saldoFake + u.saldoFakeRetenido)} de saldo fake
            </strong>{" "}
            — no es plata que le debas y no se puede retirar.
          </p>
        ) : null}

        {/* ---------------------------------------------------- balance */}
        <section className="mt-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Cómo le fue jugando
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato label="Apostado" valor={`S/${soles(t.apostado)}`} detalle="Solo lo emparejado" />
            <Dato label="Cobrado" valor={`S/${soles(t.cobrado)}`} detalle="Premios recibidos" />
            <Dato
              label="Resultado"
              valor={`${t.neto >= 0 ? "+" : ""}S/${soles(t.neto)}`}
              detalle="Ganó menos perdió"
              tono={t.neto >= 0 ? "win" : "lose"}
            />
            {/* El único que no se puede deducir de los otros: si jugó con
                saldo fake, el resultado de arriba promete plata que no
                existe. */}
            <Dato
              label="Resultado real"
              valor={`${t.netoReal >= 0 ? "+" : ""}S/${soles(t.netoReal)}`}
              detalle="Sin contar saldo fake"
              tono={t.netoReal >= 0 ? "win" : "lose"}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-parchment/40">
            <strong className="text-parchment/60">Resultado</strong> es desde la vista del
            jugador: positivo significa que él ganó, o sea que la casa pagó.{" "}
            <strong className="text-parchment/60">Apostado</strong> cuenta solo lo que llegó a
            emparejarse — lo que nadie cubrió vuelve al saldo y no es una apuesta perdida.
            {t.enJuego > 0 ? ` Tiene ${t.enJuego} jugada(s) todavía en juego, que no suman acá.` : ""}
          </p>
        </section>

        {/* --------------------------------------------------- historial */}
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Historial ({jugadas.length})
          </h2>

          {jugadas.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Este jugador todavía no ha jugado nada.
            </Panel>
          ) : (
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gold-dark/40 text-left text-[11px] uppercase tracking-wide text-parchment/40">
                    <th className="px-3 py-2 font-semibold">Fecha</th>
                    <th className="px-3 py-2 font-semibold">Juego</th>
                    <th className="px-3 py-2 font-semibold">Detalle</th>
                    <th className="px-3 py-2 text-right font-semibold">Apostado</th>
                    <th className="px-3 py-2 text-right font-semibold">Cobrado</th>
                    <th className="px-3 py-2 text-right font-semibold">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {jugadas.map((j, i) => (
                    <tr key={`${j.fecha}-${i}`} className="border-b border-gold-dark/20 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-parchment/50">
                        {fecha(j.fecha)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-md border border-gold-dark/60 px-2 py-0.5 text-[11px] text-parchment/70">
                          {j.juego}
                        </span>
                        {j.esFake ? (
                          <span className="ml-1 text-[10px] font-bold uppercase text-parchment/35">
                            fake
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-2 text-parchment/70">
                        {j.detalle}
                      </td>
                      <td className="px-3 py-2 text-right text-parchment/60">
                        S/{soles(j.apostado)}
                      </td>
                      <td className="px-3 py-2 text-right text-parchment/60">
                        {j.cobrado > 0 ? `S/${soles(j.cobrado)}` : "—"}
                      </td>
                      <td
                        className={clsx(
                          "whitespace-nowrap px-3 py-2 text-right font-display font-bold",
                          j.estado === "ganada"
                            ? "text-win-glow"
                            : j.estado === "perdida"
                              ? "text-lose-glow"
                              : "text-parchment/40"
                        )}
                      >
                        {j.estado === "ganada"
                          ? `+S/${soles(j.resultado)}`
                          : j.estado === "perdida"
                            ? `−S/${soles(Math.abs(j.resultado))}`
                            : j.estado === "en juego"
                              ? "en juego"
                              : "sin cubrir"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </section>
      </main>
    </>
  );
}

function Dato({
  label,
  valor,
  detalle,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  detalle?: string;
  tono?: "neutro" | "win" | "lose";
}) {
  return (
    <Panel className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-parchment/40">{label}</p>
      <p
        className={clsx(
          "mt-1 font-display text-xl font-bold",
          tono === "win" ? "text-win-glow" : tono === "lose" ? "text-lose-glow" : "text-parchment"
        )}
      >
        {valor}
      </p>
      {detalle ? <p className="mt-0.5 text-[11px] text-parchment/40">{detalle}</p> : null}
    </Panel>
  );
}

export default function FichaUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  // En Next 16 `params` es una promesa: se desenvuelve con `use()`.
  const { id } = use(params);
  return (
    <RequireAdmin>
      <FichaContent id={id} />
    </RequireAdmin>
  );
}
