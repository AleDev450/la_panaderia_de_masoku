/**
 * La carrera de caballitos del sorteo (0056).
 *
 * Lógica pura, igual que `src/lib/ruleta.ts`: acá no se decide quién gana.
 * Eso ya lo hizo `admin_correr_carrera` en Postgres y llegó escrito. Este
 * archivo solo dibuja el camino hasta ese resultado.
 *
 * UN CABALLO POR TICKET. Quien tiene 4 tickets corre con `Fulano_01` …
 * `Fulano_04`. Cada caballo de la pista vale exactamente lo mismo, así que la
 * ventaja del que compró más se VE en vez de estar escondida en una
 * probabilidad invisible.
 *
 * TODO SALE DE LA SEMILLA. Los perfiles de velocidad, el orden de los
 * carriles y hasta los adelantamientos se derivan de `hash(semilla + id del
 * caballo)`. Dos navegadores con la misma semilla dibujan la misma carrera,
 * frame por frame — y nadie puede adivinarla antes de que el backend la
 * mande.
 */

/** Cuánto dura la carrera, sin contar la cuenta regresiva. */
export const DURACION_CARRERA_MS = 14_000;

/**
 * Los 3 segundos que `admin_correr_carrera` deja en `inicia_en` (0057): la
 * cuenta que todo el mundo reconoce, y de paso el margen que necesita el poll
 * de los clientes para llegar a la largada.
 *
 * Tiene que coincidir con el `interval` de la migración. Si cambia allá y no
 * acá, la pantalla contaría hasta un número que no es el que espera.
 */
export const CUENTA_REGRESIVA_CARRERA_MS = 3_000;

/** Cuánto dura el cartel de "¡CORRAN!" una vez abierta la puerta. */
export const DURACION_CORRAN_MS = 1_200;

export type Caballo = {
  /** `${inscripcionId}:${numero}` — único en la pista. */
  id: string;
  inscripcionId: string;
  usuarioId: string;
  nickname: string;
  /** 1..tickets de esa persona. */
  numero: number;
  /** Lo que se lee en el carril: `Fulano_03`. */
  etiqueta: string;
};

export type InscripcionCarrera = {
  inscripcionId: string;
  usuarioId: string;
  nickname: string;
  tickets: number;
};

/** El id del caballo ganador, tal como lo arma `armarCaballos`. */
export function idDeCaballo(inscripcionId: string, numero: number): string {
  return `${inscripcionId}:${numero}`;
}

/**
 * Expande las inscripciones en caballos: uno por ticket.
 *
 * Los que tienen 0 tickets NO corren — es lo mismo que ya hace el sorteo en
 * Postgres, que los excluye con `tickets > 0`. Aparecen aparte en la pantalla
 * para que nadie se pregunte por qué no está.
 */
export function armarCaballos(inscripciones: InscripcionCarrera[]): Caballo[] {
  const caballos: Caballo[] = [];

  for (const i of inscripciones) {
    for (let n = 1; n <= i.tickets; n++) {
      caballos.push({
        id: idDeCaballo(i.inscripcionId, n),
        inscripcionId: i.inscripcionId,
        usuarioId: i.usuarioId,
        nickname: i.nickname,
        numero: n,
        etiqueta: `${i.nickname}_${String(n).padStart(2, "0")}`,
      });
    }
  }

  return caballos;
}

// ---------------------------------------------------------------------------
// Azar reproducible
// ---------------------------------------------------------------------------

/**
 * FNV-1a de 32 bits con el finalizador de MurmurHash3.
 *
 * EL FINALIZADOR NO ES ADORNO. FNV-1a solo tiene mala avalancha en el último
 * carácter: cambiarlo mueve el hash apenas ~16.7M sobre 4.29e9, o sea un
 * 0.4%. Con ids como `i4-0:1` … `i4-0:4` eso deja hashes casi pegados, y
 * cualquier cosa que ORDENE por el hash —el cajón de partida, por ejemplo—
 * termina agrupando a los caballos de la misma persona en vez de barajarlos.
 * Se detectó justo así: 21 caballos con un vecino del mismo dueño cuando el
 * azar predice 3.
 */
function hash32(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Mulberry32: pequeño, rápido y —lo que importa acá— idéntico en todos los
 * navegadores. `Math.random()` no serviría: cada pantalla vería otra carrera. */
function rng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Perfil de cada caballo
// ---------------------------------------------------------------------------

/**
 * Los límites del vaivén están calculados para que un caballo NUNCA retroceda.
 *
 * La posición es `f·t + amp·sin(freq·2π·t + fase)·env(t)`. Su derivada tiene
 * como peor caso `amp·freq·2π + amp·1.5·π`, que con estos topes da ~0.78 —
 * por debajo del `f` más chico (0.82). Un caballo que camina para atrás
 * arruina la ilusión más rápido que cualquier otra cosa.
 */
const AMP_MIN = 0.025;
const AMP_MAX = 0.045;
const FREQ_MIN = 1.2;
const FREQ_MAX = 2.0;
/** Dónde termina el último caballo. El ganador siempre termina en 1. */
const META_MIN = 0.82;
const META_MAX = 0.985;

export type PerfilCaballo = {
  caballo: Caballo;
  /** Dónde queda al cruzar la meta. 1 = ganador. */
  meta: number;
  amp: number;
  freq: number;
  fase: number;
  /** Carril, ya barajado. */
  carril: number;
};

/**
 * Arma el perfil de cada caballo a partir de la semilla.
 *
 * El ganador termina en 1 y el resto se reparte entre 0.985 y 0.82, en un
 * orden que también sale de la semilla. El vaivén se apaga al llegar a la
 * meta (`env(1) = 0`), así que el orden final es EXACTAMENTE el de `meta`:
 * la animación no puede terminar con otro caballo adelante del ganador.
 */
export function perfilesDeCarrera(
  semilla: string,
  caballos: Caballo[],
  ganadorId: string
): PerfilCaballo[] {
  const perdedores = caballos.filter((c) => c.id !== ganadorId);

  // Orden de llegada de los que no ganan: barajado con la semilla.
  const conClave = perdedores.map((c) => ({ c, clave: rng(hash32(`${semilla}|orden|${c.id}`))() }));
  conClave.sort((a, b) => a.clave - b.clave);

  const metas = new Map<string, number>();
  metas.set(ganadorId, 1);
  conClave.forEach(({ c }, i) => {
    const paso = conClave.length > 1 ? i / (conClave.length - 1) : 0;
    metas.set(c.id, META_MAX - paso * (META_MAX - META_MIN));
  });

  // Los carriles también se barajan: agrupar a los 4 caballos de una persona
  // uno debajo del otro haría la carrera más aburrida de mirar.
  const conCarril = caballos
    .map((c) => ({ c, clave: rng(hash32(`${semilla}|carril|${c.id}`))() }))
    .sort((a, b) => a.clave - b.clave);
  const carriles = new Map(conCarril.map(({ c }, i) => [c.id, i]));

  return caballos.map((caballo) => {
    const r = rng(hash32(`${semilla}|perfil|${caballo.id}`));
    return {
      caballo,
      meta: metas.get(caballo.id) ?? META_MIN,
      amp: AMP_MIN + r() * (AMP_MAX - AMP_MIN),
      freq: FREQ_MIN + r() * (FREQ_MAX - FREQ_MIN),
      fase: r() * Math.PI * 2,
      carril: carriles.get(caballo.id) ?? 0,
    };
  });
}

/**
 * Qué tan avanzado está un caballo, de 0 a su meta.
 *
 * `env(t) = sin(πt)^1.5` apaga el vaivén en la largada y en la llegada: en la
 * largada porque todos salen del cajón parejos, y en la llegada porque el
 * orden final tiene que ser el que ya decidió Postgres.
 */
export function posicionCaballo(perfil: PerfilCaballo, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const env = Math.pow(Math.sin(Math.PI * x), 1.5);
  const vaiven = perfil.amp * Math.sin(perfil.freq * 2 * Math.PI * x + perfil.fase) * env;
  return Math.max(0, perfil.meta * x + vaiven);
}

export type FaseCarrera =
  | { fase: "cuenta"; segundos: number; t: 0 }
  | { fase: "corriendo"; t: number }
  | { fase: "terminada"; t: 1 };

/**
 * En qué momento de la carrera estamos.
 *
 * Se mide contra `inicia_en`, una marca del reloj del SERVIDOR, así que todas
 * las pantallas van sincronizadas y el que llega tarde se engancha a mitad de
 * carrera en vez de arrancarla de cero.
 */
export function faseDeCarrera(msDesdeInicio: number): FaseCarrera {
  if (msDesdeInicio < 0) {
    return {
      fase: "cuenta",
      segundos: Math.min(
        Math.ceil(CUENTA_REGRESIVA_CARRERA_MS / 1000),
        Math.max(1, Math.ceil(-msDesdeInicio / 1000))
      ),
      t: 0,
    };
  }
  if (msDesdeInicio >= DURACION_CARRERA_MS) return { fase: "terminada", t: 1 };
  return { fase: "corriendo", t: msDesdeInicio / DURACION_CARRERA_MS };
}

/** Un color estable por persona, para reconocer de un vistazo a "tus"
 * caballos entre los 32 de la pista. */
export function colorDePersona(usuarioId: string): string {
  return `hsl(${hash32(usuarioId) % 360} 70% 58%)`;
}

/** Un ticket comprado de una ronda en modo carrera (0058). */
export type TicketCarrera = { id: string; usuarioId: string; nickname: string };

/**
 * Un caballo por cada ticket COMPRADO.
 *
 * Es la variante para el juego de caballitos, donde los tickets se compran con
 * saldo y ya existen como filas propias en `ruleta_tickets`. Acá no hay nada
 * que expandir: cada fila ya es un caballo.
 *
 * EL ID DEL CABALLO ES EL ID DEL TICKET, y eso importa: `ganador_ticket_id`
 * apunta exactamente ahí, así que el caballo ganador se encuentra sin
 * traducir nada ni recalcular numeraciones.
 *
 * El número que se ve (`Fulano_03`) se cuenta por persona en el orden en que
 * compró, para que a alguien con 4 tickets se le lean del 01 al 04.
 */
export function armarCaballosDeTickets(tickets: TicketCarrera[]): Caballo[] {
  const llevados = new Map<string, number>();

  return tickets.map((t) => {
    const numero = (llevados.get(t.usuarioId) ?? 0) + 1;
    llevados.set(t.usuarioId, numero);

    return {
      id: t.id,
      inscripcionId: t.id,
      usuarioId: t.usuarioId,
      nickname: t.nickname,
      numero,
      etiqueta: `${t.nickname}_${String(numero).padStart(2, "0")}`,
    };
  });
}

/**
 * Quiénes salen a la pista.
 *
 * QUIEN YA GANÓ NO VUELVE A CORRER: el sorteo lo excluye en Postgres (`and
 * not ganador`), así que dejar sus caballos sería mostrar corredores que no
 * pueden ganar — se verían punteando a mitad de carrera y perdiendo siempre,
 * sin ninguna explicación a la vista.
 *
 * La excepción es el ganador de LA carrera que se está mostrando: mientras se
 * ve su llegada tiene que seguir en la pista, o desaparecería justo el caballo
 * que acaba de cruzar primero.
 *
 * @param ganadorActual  la inscripción ganadora de la carrera en pantalla.
 */
export function caballosEnPista(
  inscripciones: (InscripcionCarrera & { ganador: boolean })[],
  ganadorActual: string | null
): Caballo[] {
  return armarCaballos(
    inscripciones.filter((i) => !i.ganador || i.inscripcionId === ganadorActual)
  );
}

/**
 * El orden de los caballos en el cajón, antes de que haya carrera.
 *
 * Barajado a propósito: `armarCaballos` los devuelve agrupados por persona, y
 * ver `Frank95_01` … `Frank95_04` uno debajo del otro hace que la pista
 * parezca una planilla en vez de una partida. El barajado es estable —sale
 * del id— así que la fila no baila entre refrescos.
 */
export function ordenEnCajon(caballos: Caballo[]): Caballo[] {
  return [...caballos].sort((a, b) => hash32(`cajon|${a.id}`) - hash32(`cajon|${b.id}`));
}

/**
 * En qué puesto va cada caballo AHORA, de 1 en adelante.
 *
 * Es lo que deja seguir al propio caballo entre 32 sin tener que medir barras
 * con el ojo. Se recalcula en cada frame: con 32 corredores, ordenar sale
 * gratis al lado de repintar.
 */
export function puestosActuales(
  perfiles: PerfilCaballo[],
  t: number
): Map<string, number> {
  const orden = perfiles
    .map((p) => ({ id: p.caballo.id, x: posicionCaballo(p, t) }))
    .sort((a, b) => b.x - a.x);

  return new Map(orden.map((c, i) => [c.id, i + 1]));
}
