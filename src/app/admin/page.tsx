"use client";

import Link from "next/link";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { useRecargas } from "@/context/RecargasContext";
import { useMatches } from "@/context/MatchesContext";

function AdminHomeContent() {
  const { recargas } = useRecargas();
  const { matches } = useMatches();

  const pendientes = recargas.filter((r) => r.estado === "pendiente").length;
  const abiertos = matches.filter((m) => m.estado === "abierto").length;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">
          Panel de administración
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          Gestiona recargas, títulos de apuesta y sus resultados.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/admin/recargas">
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
                {pendientes}{" "}
                <span className="text-sm font-normal text-parchment/50">pendientes</span>
              </p>
            </Panel>
          </Link>

          <Link href="/admin/titulos">
            <Panel className="flex h-full flex-col justify-between p-5 transition hover:border-gold-light">
              <div>
                <h2 className="font-fantasy text-lg font-semibold text-gold-light">
                  Títulos de apuesta
                </h2>
                <p className="mt-1 text-sm text-parchment/60">
                  Crea nuevos títulos, ajusta el contador y declara resultados.
                </p>
              </div>
              <p className="mt-4 font-fantasy text-2xl font-bold text-parchment">
                {abiertos}{" "}
                <span className="text-sm font-normal text-parchment/50">abiertos</span>
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
