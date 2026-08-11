import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "ghost" | "win" | "lose";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-crimson-light to-crimson-dark border-gold text-gold-light hover:brightness-110 focus-visible:outline-gold-light",
  ghost:
    "bg-transparent border-gold-dark text-parchment hover:border-gold hover:text-gold-light",
  win: "bg-gradient-to-b from-win to-[#1f5b28] border-win-glow text-white hover:brightness-110",
  lose: "bg-gradient-to-b from-lose to-[#5c1417] border-lose-glow text-white hover:brightness-110",
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
        "min-h-11 rounded-md border-2 px-5 py-2.5 font-fantasy text-sm font-semibold tracking-wider uppercase transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
