import { InputHTMLAttributes } from "react";
import clsx from "clsx";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  error?: string;
}

/**
 * Input de los formularios de acceso.
 *
 * El fondo era `bg-[#160d06]` — un marrón quemado, elegido para asentarse
 * sobre el arte de madera de los PNG que ya no existen. Ahora hereda los
 * tokens de la app. Los tamaños con `clamp()` también se van: estaban
 * calibrados contra las proporciones de esa imagen, no contra el texto.
 */
export function PanelField({ id, label, error, className, ...rest }: Props) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-parchment/50"
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={clsx(
          "min-h-12 w-full rounded-lg border bg-obsidian/70 px-3.5 py-2.5 font-sans text-sm text-parchment outline-none transition placeholder:text-parchment/30",
          error
            ? "border-lose-glow/70"
            : "border-gold-dark hover:border-gold-dark focus:border-gold/60",
          "focus-visible:ring-2 focus-visible:ring-gold-light",
          className
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs leading-tight text-lose-glow">
          {error}
        </p>
      ) : null}
    </div>
  );
}
