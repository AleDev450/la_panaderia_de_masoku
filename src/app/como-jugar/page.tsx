import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { BET_MAX, BET_MIN } from "@/types";

const STEPS = [
  {
    title: "1. Elige tu lado",
    body: `El primer jugador selecciona GANA o PIERDE y define un monto entre S/${BET_MIN} y S/${BET_MAX}. El reto queda publicado esperando un rival.`,
  },
  {
    title: "2. Un rival toma el lado contrario",
    body: "El siguiente jugador solo puede elegir la posición opuesta, apostando exactamente el mismo monto. No puede cambiarlo.",
  },
  {
    title: "3. Duelo emparejado 1:1",
    body: "Cuando ambos lados están cubiertos, el reto se marca como DUELO EMPAREJADO 1:1. No se permite que dos jugadores apuesten al mismo lado, y el creador del reto no puede aceptar su propia apuesta.",
  },
];

export default function ComoJugarPage() {
  return (
    <RequireAuth>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Cómo jugar</h1>
        <p className="mt-2 text-sm text-parchment/60">
          LA PANADERÍA DE MASOKU funciona con un único formato: apuestas 1 contra 1, un jugador
          apuesta a que el equipo gana, otro a que pierde. Mismo monto, mismas condiciones.
        </p>

        <div className="mt-8 flex flex-col gap-4">
          {STEPS.map((step) => (
            <Panel key={step.title} className="p-5">
              <h2 className="font-fantasy text-lg font-semibold text-gold-light">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-parchment/75">{step.body}</p>
            </Panel>
          ))}
        </div>

        <Panel className="mt-8 border-gold-light/50 bg-gold/5 p-5">
          <h2 className="font-fantasy text-lg font-semibold text-gold-light">
            Juego responsable
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-parchment/75">
            LA PANADERÍA DE MASOKU es una demostración: no involucra pagos, depósitos, retiros
            ni criptomonedas reales. El acceso está restringido a mayores de 18
            años. Apuesta con moderación.
          </p>
        </Panel>
      </main>
    </RequireAuth>
  );
}
