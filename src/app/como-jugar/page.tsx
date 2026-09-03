import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { BET_MAX, BET_MIN, PUNTOS_POR_GANAR, PUNTOS_POR_PERDER } from "@/types";
import { CUOTA, pagoPorMatcheado } from "@/lib/apuestas";
import { MONTO_MAX, MONTO_MIN, MONTO_PASO } from "@/lib/recargas";

const STEPS = [
  {
    title: "1. Recarga tu saldo",
    body: `Sin saldo no puedes apostar. Sube el comprobante de tu depósito en Recargar saldo, en montos de S/${MONTO_PASO} en S/${MONTO_PASO} hasta S/${MONTO_MAX} (mínimo S/${MONTO_MIN}). Un administrador verifica la hora del depósito y lo acredita.`,
  },
  {
    title: "2. Elige un título del día",
    body: "En Partidas ves solo los títulos publicados hoy, con su categoría (Dota 2, Counter-Strike, LoL, Valorant u otros) y un contador. Cada título tiene dos lados opuestos: uno acierta y el otro no.",
  },
  {
    title: "3. Apuesta el monto que quieras",
    body: `Eliges un lado y un monto entre S/${BET_MIN} y S/${BET_MAX}. No necesitas igualar a nadie: tu apuesta busca contraparte en el lado contrario y se va cubriendo con lo que otros pongan, aunque sean montos distintos a los tuyos.`,
  },
  {
    title: "4. Varios pueden cubrirte de a poco",
    body: "Si pides S/100 y alguien pone S/40, quedas cubierto en S/40 y sigues buscando los S/60 restantes. Se empareja por orden de llegada: quien apostó primero se cubre primero. No puedes emparejarte contigo mismo.",
  },
  {
    title: "5. Cierra el contador",
    body: "Al vencer el contador ya no entran apuestas nuevas al título. Mientras siga abierto puedes cancelar la parte que aún no se emparejó; lo ya emparejado queda en juego y no se puede retirar.",
  },
  {
    title: "6. Se declara el resultado",
    body: `Un administrador declara qué lado acertó. Sobre tu monto emparejado cobras ${CUOTA}x si acertaste; si no, lo pierdes. Todo lo que nunca llegó a emparejarse vuelve entero a tu saldo, hayas acertado o no.`,
  },
];

export default function ComoJugarPage() {
  return (
    <RequireAuth>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-bold text-parchment">Cómo jugar</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Apuestas entre jugadores, sin casa que ponga el dinero: tu apuesta
          se empareja contra la de quienes eligieron el lado contrario. Lo
          emparejado paga {CUOTA}x; lo que nadie cubrió se te devuelve.
        </p>

        <div className="mt-8 flex flex-col gap-4">
          {STEPS.map((step) => (
            <Panel key={step.title} className="p-5">
              <h2 className="font-display text-lg font-semibold text-gold-light">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-parchment/75">{step.body}</p>
            </Panel>
          ))}
        </div>

        <Panel className="mt-8 border-gold-light/40 p-5">
          <h2 className="font-display text-lg font-semibold text-gold-light">
            Un ejemplo con números
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-parchment/75">
            <li>
              Apuestas <strong className="text-parchment">S/100</strong> a que el
              el equipo local gana la serie.
            </li>
            <li>
              Entran dos jugadores al lado contrario con{" "}
              <strong className="text-parchment">S/40</strong> y{" "}
              <strong className="text-parchment">S/20</strong>. Quedas
              emparejado en S/60 y siguen faltando S/40.
            </li>
            <li>
              Vence el contador sin que nadie cubra el resto: esos{" "}
              <strong className="text-parchment">S/40 vuelven a tu saldo</strong>.
            </li>
            <li>
              Si el local gana, cobras{" "}
              <strong className="text-win-glow">S/{pagoPorMatcheado(60)}</strong> por los
              S/60 emparejados. Si pierde, esos S/60 se van.
            </li>
          </ul>
        </Panel>

        <Panel className="mt-4 p-5">
          <h2 className="font-display text-lg font-semibold text-gold-light">
            Puntos y rango de cachudo
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-parchment/75">
            Al resolverse un título ganas{" "}
            <strong className="text-parchment">
              +{PUNTOS_POR_GANAR} puntos
            </strong>{" "}
            si acertaste y{" "}
            <strong className="text-parchment">+{PUNTOS_POR_PERDER} punto</strong>{" "}
            si no — participar siempre suma. Solo puntúan las apuestas que
            llegaron a emparejar algo. Los puntos suben tu rango, de Novato
            hasta Rey Cachudo, y te posicionan en el Ranking.
          </p>
        </Panel>

        <Panel className="mt-4 border-gold-light/50 bg-gold/5 p-5">
          <h2 className="font-display text-lg font-semibold text-gold-light">
            Juego responsable
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-parchment/75">
            El acceso está restringido a mayores de 18 años. Apuesta con
            moderación: no arriesgues más saldo del que puedas permitirte
            perder.
          </p>
        </Panel>
      </main>
    </RequireAuth>
  );
}
