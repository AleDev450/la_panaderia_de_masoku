import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { OrderBookPanel } from "@/components/exchange/OrderBookPanel";
import { getEvento, getMisApuestas, getOrderBook } from "@/actions/betting";

export default async function ExchangeEventPage({
  params,
}: {
  params: Promise<{ eventoId: string }>;
}) {
  const { eventoId } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <RequireAuth>
        <Header />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
          <Panel className="p-6 text-center">
            <h1 className="font-fantasy text-xl font-bold text-gold-light">
              Motor de apuestas (Supabase) no configurado
            </h1>
            <p className="mt-3 text-sm text-parchment/70">
              Esta pantalla consume el motor de emparejamiento real (Postgres +
              RLS + RPC). Configura <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> y{" "}
              <code>SUPABASE_SERVICE_ROLE_KEY</code> en <code>.env.local</code>{" "}
              y aplica las migraciones en <code>supabase/migrations</code>{" "}
              (ver README, sección &quot;Motor de emparejamiento&quot;).
            </p>
            <Link
              href="/partidas"
              className="mt-4 inline-block text-sm font-semibold text-gold-light underline"
            >
              Volver a Partidas de hoy
            </Link>
          </Panel>
        </main>
      </RequireAuth>
    );
  }

  const [eventoResult, bookResult, misApuestasResult] = await Promise.all([
    getEvento(eventoId),
    getOrderBook(eventoId),
    getMisApuestas(eventoId),
  ]);

  return (
    <RequireAuth>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {!eventoResult.ok || !bookResult.ok || !misApuestasResult.ok ? (
          <Panel className="p-6 text-center text-sm text-lose-glow">
            {(!eventoResult.ok && eventoResult.error) ||
              (!bookResult.ok && bookResult.error) ||
              (!misApuestasResult.ok && misApuestasResult.error)}
          </Panel>
        ) : (
          <>
            <h1 className="font-fantasy text-2xl font-bold text-parchment sm:text-3xl">
              {eventoResult.data.nombre}
            </h1>
            <p className="mt-1 text-sm text-parchment/60">
              Estado del evento:{" "}
              <span className="font-semibold text-gold-light">
                {eventoResult.data.estado}
              </span>{" "}
              · Cuota fija 1.80
            </p>

            <div className="mt-6">
              <OrderBookPanel
                eventoId={eventoId}
                eventoNombre={eventoResult.data.nombre}
                ladoALabel={eventoResult.data.lado_a}
                ladoBLabel={eventoResult.data.lado_b}
                initialBook={bookResult.data}
                initialMisApuestas={misApuestasResult.data}
              />
            </div>
          </>
        )}
      </main>
    </RequireAuth>
  );
}
