/**
 * Ventana para corregir un resultado antes de que se pague — debe
 * coincidir con el intervalo de `liquidar_eventos_vencidos` (0013).
 *
 * Vive acá y no en `src/actions/admin.ts` porque un archivo `"use server"`
 * solo admite exports de funciones async: exportar una constante desde ahí
 * anula en silencio TODOS los exports del módulo. Ni tsc ni eslint lo
 * detectan; solo revienta en runtime.
 */
export const VENTANA_CORRECCION_MS = 60_000;
