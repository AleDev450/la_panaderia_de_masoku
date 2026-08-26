import { Fragment, ReactNode } from "react";

/**
 * Mini-markdown para el texto de los sorteos.
 *
 * POR QUÉ UNO PROPIO Y NO UNA LIBRERÍA: lo único que hace falta es negrita,
 * links y color, y cualquier parser de markdown de verdad termina
 * escupiendo HTML que hay que inyectar con `dangerouslySetInnerHTML`. Acá
 * se devuelven nodos de React directo — no hay forma de que un `<script>` o
 * un `onerror=` escrito en el editor llegue al DOM, porque nunca se
 * interpreta HTML. El texto lo escribe un admin, pero "solo el admin lo
 * escribe" no es una defensa: si algún día una cuenta de staff se filtra,
 * esto sería una inyección en la página que ve todo el mundo.
 *
 * ESTRUCTURA (nivel bloque): los pasos se separan con una LÍNEA EN BLANCO.
 * Dentro de cada paso, la primera línea es el título y las que siguen son
 * el detalle:
 *
 *     Compra mi bundle en Dota
 *     {azul:Brillante}: 1 ticket | {morado:Holográfico}: 2 tickets
 *
 *     Asegúrate de tener tu inventario en público
 *     Puedes ir a [Ajustes de Steam](https://steamcommunity.com/my/edit/settings).
 *
 * MARCAS (nivel línea):
 *     **negrita**
 *     [texto](https://url)
 *     {color:texto}      con color ∈ COLORES
 *
 * Se anidan hasta 2 niveles: `{oro:**Dorado**}` funciona.
 */

/** Paleta cerrada a propósito: un color libre (`{#ff0000:...}`) obligaría a
 * generar clases que Tailwind no puede ver al compilar, y saldrían sin
 * estilo. Estas están escritas literales, así que sí las ve. */
export const COLORES: Record<string, string> = {
  oro: "text-gold-light",
  verde: "text-win-glow",
  rojo: "text-lose-glow",
  crema: "text-parchment",
  azul: "text-[#7cc4ff]",
  morado: "text-[#c08cff]",
  rosa: "text-[#ff8fc7]",
};

export interface BloqueTexto {
  titulo: string;
  detalle: string[];
}

/** Parte el texto en pasos por línea en blanco. Ignora bloques vacíos. */
export function parsearBloques(texto: string): BloqueTexto[] {
  return texto
    .split(/\n\s*\n/)
    .map((bloque) => bloque.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lineas) => lineas.length > 0)
    .map((lineas) => ({ titulo: lineas[0], detalle: lineas.slice(1) }));
}

// Un solo regex con alternancia: negrita | link | color. El orden importa
// solo para la legibilidad — los tres arrancan con caracteres distintos.
const MARCAS = /\*\*([\s\S]+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\{(\w+):([^{}]+)\}/g;

/** Solo http/https. Un `javascript:` en un href es ejecución de código al
 * clic, y es exactamente lo que alguien intentaría meter acá. */
function urlSegura(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Convierte una línea en nodos de React. `profundidad` corta el anidamiento
 * para que un texto raro no pueda hacer recursión sin fondo.
 */
function inline(texto: string, profundidad = 0): ReactNode[] {
  if (profundidad > 2) return [texto];

  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let clave = 0;

  // `matchAll` sobre un regex con /g devuelve los índices que necesitamos
  // para ir cortando el texto plano entre marca y marca.
  for (const m of texto.matchAll(MARCAS)) {
    const indice = m.index ?? 0;
    if (indice > ultimo) nodos.push(texto.slice(ultimo, indice));

    const [completo, negrita, textoLink, urlLink, color, textoColor] = m;

    if (negrita !== undefined) {
      nodos.push(
        <strong key={clave++} className="font-semibold text-parchment">
          {inline(negrita, profundidad + 1)}
        </strong>
      );
    } else if (textoLink !== undefined && urlLink !== undefined) {
      // Un link inseguro no se descarta en silencio: se muestra el texto
      // plano, para que el admin note que algo no quedó como esperaba.
      nodos.push(
        urlSegura(urlLink) ? (
          <a
            key={clave++}
            href={urlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-light underline decoration-gold-dark underline-offset-2 hover:text-parchment"
          >
            {inline(textoLink, profundidad + 1)}
          </a>
        ) : (
          <Fragment key={clave++}>{textoLink}</Fragment>
        )
      );
    } else if (color !== undefined && textoColor !== undefined) {
      const clase = COLORES[color.toLowerCase()];
      nodos.push(
        clase ? (
          <span key={clave++} className={clase}>
            {inline(textoColor, profundidad + 1)}
          </span>
        ) : (
          // Color que no existe: se deja el texto tal cual, no la llave.
          <Fragment key={clave++}>{inline(textoColor, profundidad + 1)}</Fragment>
        )
      );
    }

    ultimo = indice + completo.length;
  }

  if (ultimo < texto.length) nodos.push(texto.slice(ultimo));
  return nodos;
}

/** Una línea con sus marcas resueltas. */
export function TextoConMarcas({ texto }: { texto: string }) {
  return <>{inline(texto)}</>;
}

/**
 * Los pasos numerados, tal cual salen en /sorteos. El panel de administración
 * usa este mismo componente para la vista previa: lo que el admin ve es
 * literalmente lo que se publica.
 */
export function PasosNumerados({ bloques }: { bloques: BloqueTexto[] }) {
  return (
    <ol className="space-y-4">
      {bloques.map((bloque, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-crimson-dark text-[11px] font-bold text-gold-light">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="font-semibold leading-snug text-parchment">
              <TextoConMarcas texto={bloque.titulo} />
            </p>
            {bloque.detalle.map((linea, j) => (
              <p key={j} className="mt-1 text-sm leading-relaxed text-parchment/60">
                <TextoConMarcas texto={linea} />
              </p>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
