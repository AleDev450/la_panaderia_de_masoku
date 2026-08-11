import { HTMLAttributes } from "react";
import clsx from "clsx";

export function Panel({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("panel-stone rounded-xl", className)} {...props}>
      {children}
    </div>
  );
}
