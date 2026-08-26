import { User } from "@/types";

/**
 * Las tres formas de mirar el saldo de un jugador cuando hay plata fake de
 * por medio (0036_saldo_fake.sql). Están acá y no repartidas por las
 * pantallas porque la diferencia entre las dos primeras es sutil y se
 * presta a usar la que no toca.
 */

/**
 * Lo que se le MUESTRA como "Saldo": real + fake, en un solo número.
 * A propósito indistinguible — el saldo fake existe justamente para que una
 * cuenta se vea con plata y dé con quién emparejar.
 */
export function saldoVisible(user: Pick<User, "balance" | "balanceFake">): number {
  return Math.round((user.balance + user.balanceFake) * 100) / 100;
}

/**
 * La apuesta más grande que el motor va a aceptar. NO es la suma: una
 * apuesta sale de una sola bolsa (fake si el saldo fake la cubre entera, si
 * no de la real), así que con S/30 fake y S/70 real lo máximo que entra en
 * una apuesta es 70, no 100.
 *
 * Ver `crear_apuesta` en 0036_saldo_fake.sql.
 */
export function maxPorApuesta(user: Pick<User, "balance" | "balanceFake">): number {
  return Math.max(user.balance, user.balanceFake);
}

/**
 * Lo apartado en apuestas vivas, real + fake. NO se perdió: vuelve al
 * disponible lo que nadie cubrió, y lo emparejado paga 1.80 si gana.
 *
 * Existe porque sin mostrarlo el saldo parece evaporarse al apostar: pones
 * S/20 de tus S/116 y la pantalla dice S/96, sin nada que explique dónde
 * están los otros 20.
 */
export function saldoEnJuego(
  user: Pick<User, "balanceRetenido" | "balanceFakeRetenido">
): number {
  return Math.round((user.balanceRetenido + user.balanceFakeRetenido) * 100) / 100;
}

/**
 * Cierto cuando la suma promete más de lo que entra en una sola apuesta —
 * el único caso en que `saldoVisible` y `maxPorApuesta` no coinciden. Sirve
 * para explicarlo en el error en vez de dejar al jugador adivinando por qué
 * "tiene" 100 y no puede apostar 100.
 */
export function tieneSaldoPartido(user: Pick<User, "balance" | "balanceFake">): boolean {
  return user.balance > 0 && user.balanceFake > 0;
}
