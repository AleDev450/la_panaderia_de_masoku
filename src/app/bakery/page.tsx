"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { getEventosHoy } from "@/actions/betting";
import { getSolicitudesTelefono } from "@/actions/perfil";
import { getRecargas } from "@/actions/recargas";

function AdminHomeContent() {
  const [abiertos, setAbiertos] = useState<number | null>(null);
  const [telefonos, setTelefonos] = useState<number | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);

  useEffect(() => {
    getEventosHoy().then((result) => {
      if (result.ok) {
        setAbiertos(result.data.filter(({ evento }) => evento.estado === "abierto").length);
      }
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
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">
          Panel de la panadería
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          Gestiona recargas, títulos de apuesta y sus resultados.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/bakery/recargas">
            <Panel className="flex h-full flex-col justify-between p-5 transition hover:border-gold-light">
              <div>
                <h2 className="font-fantasy text-lg font-semibold text-gold-light">
                  Recargas
                </h2>
                <p className="mt-1 text-sm text-parchment/60">
                  Revisa comprobantes y aprueba o rechaza depósitos.
                </p>
              </div>
              <p className="mt-4 font-fantasy text-2xl font-bold text-parchment">
                {pendientes ?? "—"}{" "}
                <span className="text-sm font-normal text-parchment/50">pendientes</span>
              </p>
            </Panel>
          </Link>

          <Link href="/bakery/titulos">
            <Panel className="flex h-full flex-col justify-between p-5 transition hover:border-gold-light">
              <div>
                <h2 className="font-fantasy text-lg font-semibold text-gold-light">
                  Títulos de apuesta
                </h2>
                <p className="mt-1 text-sm text-parchment/60">
                  Publica títulos del día y declara sus resultados.
                </p>
              </div>
              <p className="mt-4 font-fantasy text-2xl font-bold text-parchment">
                {abiertos ?? "—"}{" "}
                <span className="text-sm font-normal text-parchment/50">abiertos hoy</span>
              </p>
            </Panel>
          </Link>

          <Link href="/bakery/telefonos">
            <Panel className="flex h-full flex-col justify-between p-5 transition hover:border-gold-light">
              <div>
                <h2 className="font-fantasy text-lg font-semibold text-gold-light">
                  Cambios de teléfono
                </h2>
                <p className="mt-1 text-sm text-parchment/60">
                  Aprueba o rechaza solicitudes de cambio de número.
                </p>
              </div>
              <p className="mt-4 font-fantasy text-2xl font-bold text-parchment">
                {telefonos ?? "—"}{" "}
                <span className="text-sm font-normal text-parchment/50">pendientes</span>
              </p>
            </Panel>
          </Link>
        </div>
      </main>
    </>
  );
}

export default function AdminPage() {
  return (
    <RequireAdmin>
      <AdminHomeContent />
    </RequireAdmin>
  );
}
