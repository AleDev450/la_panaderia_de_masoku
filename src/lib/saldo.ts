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
 * Cierto cuando la suma promete más de lo que entra en una sola apuesta —
 * el único caso en que `saldoVisible` y `maxPorApuesta` no coinciden. Sirve
 * para explicarlo en el error en vez de dejar al jugador adivinando por qué
 * "tiene" 100 y no puede apostar 100.
 */
export function tieneSaldoPartido(user: Pick<User, "balance" | "balanceFake">): boolean {
  return user.balance > 0 && user.balanceFake > 0;
}
