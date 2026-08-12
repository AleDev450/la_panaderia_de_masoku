import { InputHTMLAttributes } from "react";
import clsx from "clsx";

interface Box {
  top: string;
  left: string;
  width: string;
  height: string;
}

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "style"> {
  id: string;
  /** Texto del label dibujado en la imagen — se conserva para lectores de
   * pantalla (visualmente oculto) ya que el label real vive en el arte. */
  label: string;
  box: Box;
  error?: string;
}

/**
 * Input real posicionado en porcentaje sobre el recuadro ya dibujado en el
 * panel de arte (registrar.png / iniciar-sesion.png). Fondo opaco y
 * cercano al color de relleno del recuadro para tapar el texto de ejemplo
 * horneado en la imagen (p.ej. "PanConQueso"), sin dibujar un borde propio
 * — el marco ya está en el arte.
 */
export function ArtInput({ id, label, box, error, className, ...rest }: Props) {
  const errorId = `${id}-error`;
  return (
    <div className="absolute" style={box}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={clsx(
          "h-full w-full rounded-[6px] border-none bg-[#0e0a06] px-[3%] font-sans text-[clamp(0.7rem,1.6vw,1rem)] text-parchment outline-none placeholder:text-parchment/35",
          "focus-visible:ring-2 focus-visible:ring-gold-light",
          className
        )}
        {...rest}
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="absolute left-0 top-full z-10 mt-0.5 rounded bg-obsidian/90 px-1.5 py-0.5 text-[clamp(0.6rem,1.3vw,0.75rem)] leading-tight text-lose-glow"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
