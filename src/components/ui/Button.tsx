import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "ghost" | "win" | "lose";

/**
 * `primary` es amarillo sólido con texto NEGRO. Antes era un degradado
 * carmesí con texto dorado; al repuntar los tokens de carmesí al amarillo
 * de marca (globals.css) ese texto habría quedado dorado sobre amarillo —
 * ilegible. El contraste de la acción principal se fija acá, no se hereda.
 */
const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gold border-gold text-obsidian shadow-[0_6px_24px_-10px_rgba(245,197,24,0.9)] hover:bg-gold-light hover:brightness-105 focus-visible:outline-gold-light",
  ghost:
    "bg-transparent border-gold-dark text-parchment/80 hover:border-gold/70 hover:bg-white/5 hover:text-parchment",
  win: "bg-win border-win-glow/70 text-white hover:brightness-115",
  lose: "bg-lose border-lose-glow/70 text-white hover:brightness-115",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "min-h-11 rounded-lg border px-5 py-2.5 font-display text-sm font-extrabold tracking-wide uppercase transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
