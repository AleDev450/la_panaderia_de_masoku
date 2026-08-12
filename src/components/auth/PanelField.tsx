import { InputHTMLAttributes } from "react";
import clsx from "clsx";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  error?: string;
}

/**
 * Input con caja y label propios y visibles, para los paneles de arte en
 * blanco (registrar.png / iniciar-sesion.png) que solo traen el marco y el
 * título dibujados — a diferencia del viejo ArtInput, que asumía que la
 * caja del campo ya estaba pintada en la imagen.
 */
export function PanelField({ id, label, error, className, ...rest }: Props) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-0.5 block text-[clamp(0.6rem,1.3vw,0.75rem)] font-semibold uppercase tracking-wide text-gold-light"
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={clsx(
          "min-h-11 w-full rounded-md border border-gold-dark/80 bg-[#160d06]/85 px-3 py-2 font-sans text-[clamp(0.7rem,1.6vw,1rem)] text-parchment outline-none placeholder:text-parchment/35",
          "focus-visible:ring-2 focus-visible:ring-gold-light",
          className
        )}
        {...rest}
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-[clamp(0.6rem,1.3vw,0.75rem)] leading-tight text-lose-glow"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
