/**
 * Herramientas destructivas de prueba (borrar todas las recargas, etc.).
 *
 * Habilitadas salvo que se ponga `NEXT_PUBLIC_HERRAMIENTAS_PRUEBA=false`.
 * Se dejan encendidas por defecto porque hoy el despliegue es un entorno
 * de pruebas sin usuarios reales; **apágalo antes de abrir el registro al
 * público**: es un botón que vacía una tabla entera sin vuelta atrás.
 *
 * Va con prefijo NEXT_PUBLIC_ porque la UI necesita leerlo para mostrar u
 * ocultar el botón. Eso no debilita nada: la Server Action revalida el
 * mismo flag en el servidor, y ahí el valor no lo controla el navegador.
 */
export const HERRAMIENTAS_PRUEBA = process.env.NEXT_PUBLIC_HERRAMIENTAS_PRUEBA !== "false";
