"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { getSolicitudesTelefono } from "@/actions/perfil";
import { getRecargas } from "@/actions/recargas";
import { getMetricas } from "@/actions/admin";
import { AdminMetricas } from "@/lib/supabase/types";

function AdminHomeContent() {
  const [metricas, setMetricas] = useState<AdminMetricas | null>(null);
  const [telefonos, setTelefonos] = useState<number | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);

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
  }, []);

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
              label="Retirado"
              valor={metricas ? `S/${metricas.retirado_hoy}` : "—"}
              detalle="Retiros pagados"
              tono="lose"
            />
            <Metrica
              label="Pagado"
              valor={metricas ? `S/${metricas.pagado_hoy}` : "—"}
              detalle="Premios a ganadores"
              tono="lose"
            />
            <Metrica
              label="Ganancia"
              valor={metricas ? `S/${metricas.ganancia_hoy}` : "—"}
              detalle="Comisión del día"
              tono="win"
            />
            <Metrica
              label="Ganancia total"
              valor={metricas ? `S/${metricas.ganancia_total}` : "—"}
              detalle="Histórico acumulado"
              tono="win"
            />
          </div>
        </section>

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
              </p>
              <Link
                href="/bakery/pagos"
                className="mt-3 inline-block text-xs font-semibold text-gold-light underline"
              >
                Ver historial de pagos y registrar uno nuevo →
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
        </div>
      </main>
    </>
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
