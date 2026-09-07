/**
 * Herramientas destructivas de prueba (borrar todas las recargas, etc.).
 *
 * APAGADAS salvo que se pida `NEXT_PUBLIC_HERRAMIENTAS_PRUEBA=true`.
 *
 * Antes el default era al revés —encendidas salvo que se apagaran— porque el
 * despliegue era un entorno de pruebas sin nadie adentro. Eso dejó de ser
 * cierto: hay usuarios reales, saldo real y recargas que respaldan plata que
 * la gente yapeó. Un botón que vacía esa tabla de un clic no puede estar
 * encendido porque nadie se acordó de apagarlo.
 *
 * Invertir el default también arregla el caso que más importa: un despliegue
 * nuevo, o uno donde la variable no llegó a configurarse, ahora nace SEGURO en
 * vez de nacer con la herramienta activa.
 *
 * Va con prefijo NEXT_PUBLIC_ porque la UI necesita leerlo para mostrar u
 * ocultar el botón. Eso no debilita nada: la Server Action revalida el mismo
 * flag en el servidor, y ahí el valor no lo controla el navegador.
 */
export const HERRAMIENTAS_PRUEBA = process.env.NEXT_PUBLIC_HERRAMIENTAS_PRUEBA === "true";
