import { HTMLAttributes } from "react";
import clsx from "clsx";

export function Panel({
  className,
  glow = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  /** Borde y halo amarillo al pasar el mouse. Solo para cards en las que
   * se puede hacer clic — un glow en una card estática es ruido. */
  glow?: boolean;
}) {
  return (
    <div
      className={clsx("panel-stone rounded-xl", glow && "panel-glow", className)}
      {...props}
    >
      {children}
    </div>
  );
}
