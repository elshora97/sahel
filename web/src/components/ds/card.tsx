import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** `surface` on `shell`, a `line` hairline, `radius-md`. No shadow: cards sit on the page. */
export function Card({
  title,
  actions,
  children,
  id,
  padded = true,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-6 rounded-md border border-line bg-surface", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
          {title && <h2 className="text-lg leading-[26px] font-medium">{title}</h2>}
          {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-4 sm:p-6" : undefined}>{children}</div>
    </section>
  );
}
