"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import {
  EventoResumen,
  crearApuesta,
  marcarTurno,
  unirseBlackjack,
} from "@/actions/betting";
import { pagoPorMatcheado } from "@/lib/apuestas";
import { maxPorApuesta, tieneSaldoPartido } from "@/lib/saldo";

/**
 * Apostar y marcar turno, en un solo lugar.
 *
 * Vive acá y no dentro de una pantalla porque ahora hay DOS que lo usan:
 * `/partidas` y las mesas debajo del stream en `/en-vivo`. Con una copia en
 * cada una, la regla de que blackjack no entra por `crear_apuesta` (0041) se
 * arreglaría en un lado y no en el otro — y eso no se nota hasta que alguien
 * se queda sin sentarse en una mesa.
 *
 * Nada de esto decide dinero: son llamadas a las Server Actions, que a su vez
 * llaman a los RPC. Acá solo se traduce el resultado a un mensaje.
 */
export function useApuestas({
  eventos,
  refresh,
}: {
  /** Lo que hay en pantalla, para saber si el evento es una mesa de blackjack. */
  eventos: EventoResumen[] | null;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();

  async function handleApostar(eventoId: string, lado: "a" | "b", monto: number) {
    if (!user) return;
    // Contra `maxPorApuesta` y no contra `balance`: el saldo fake también
    // se puede apostar, y una apuesta sale de una sola bolsa (ver
    // src/lib/saldo.ts).
    const tope = maxPorApuesta(user);
    if (tope <= 0) {
      showToast({
        variant: "warning",
        title: "No tienes saldo",
        description: "Recarga para poder apostar.",
      });
      router.push("/recargar");
      return;
    }
    if (monto > tope) {
      throw new Error(
        tieneSaldoPartido(user)
          ? `Lo máximo que entra en una apuesta es S/${tope} — tu saldo está partido en dos y una apuesta sale de una sola parte.`
          : `Tu saldo disponible es S/${tope}.`
      );
    }

    // Blackjack no entra por `crear_apuesta`: si el asiento que elegiste
    // está tomado, el motor te abre mesa nueva en ESE mismo lado en vez de
    // rebotarte (ver 0041). Para el resto de categorías —baccarat incluido,
    // que es una categoría común (0054)— nada cambia.
    const esBlackjack =
      (eventos ?? []).find((r) => r.evento.id === eventoId)?.evento.categoria === "blackjack";

    if (esBlackjack) {
      const asiento = await unirseBlackjack({ lado, monto });
      if (!asiento.ok) throw new Error(asiento.error);

      showToast({
        variant: "success",
        title: asiento.data.mesa_nueva
          ? `Mesa llena — te abrimos la ${asiento.data.mesa_nombre}`
          : `Te sentaste en ${asiento.data.mesa_nombre}`,
        description:
          asiento.data.lado === "a"
            ? asiento.data.monto_matcheado > 0
              ? "Juegas la mano y ya tienes rival: tú pides las cartas."
              : "Juegas la mano. Esperando a quien apueste a la banca."
            : asiento.data.monto_matcheado > 0
              ? "Apostaste a la banca — su mano la juega quien reparte."
              : "Apostaste a la banca. Esperando a quien juegue la mano.",
      });
      await Promise.all([refresh(), refreshUser()]);
      return;
    }

    const result = await crearApuesta({ eventoId, lado, monto });
    if (!result.ok) throw new Error(result.error);

    // Cada apuesta es una orden independiente: apostar otra vez al mismo
    // lado suma exposición, no "edita" la anterior. Se dice explícito
    // porque el reparto entre emparejado y pendiente confunde si no.
    const matcheado = Number(result.data.monto_matcheado);
    const pendiente = Number(result.data.monto_pendiente);
    showToast({
      variant: "success",
      title: `Apostaste S/${result.data.monto_total}`,
      description:
        matcheado > 0 && pendiente > 0
          ? `S/${matcheado} ya tienen rival; S/${pendiente} esperan a que alguien los cubra.`
          : matcheado > 0
            ? `Ya tiene rival: si ganas cobras S/${pagoPorMatcheado(matcheado)}.`
            : "Nadie lo ha cubierto todavía. Si nadie lo hace, se te devuelve al cerrar.",
    });
    await Promise.all([refresh(), refreshUser()]);
  }

  async function handleMarcarTurno(eventoId: string, accion: "pedir" | "quedarse") {
    const result = await marcarTurno({ eventoId, accion });
    if (!result.ok) {
      showToast({ variant: "warning", title: "No se pudo marcar", description: result.error });
      return;
    }
    showToast({
      variant: "info",
      title: accion === "pedir" ? "Pediste carta" : "Te quedaste",
      description:
        accion === "pedir"
          ? "El que reparte ya lo ve en su panel."
          : "Tu turno terminó en esta mano.",
    });
    await refresh();
  }

  return { handleApostar, handleMarcarTurno };
}
