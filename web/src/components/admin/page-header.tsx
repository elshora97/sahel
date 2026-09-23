import type { ReactNode } from "react";

import { GuardedLink } from "./guarded-link";
import { linkCls } from "./ui";

/** Title row from the app design: `heading` h1, muted subtitle, actions at the end edge. */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {back && (
          <GuardedLink href={back.href} className={`${linkCls} self-start text-sm`}>
            {back.label}
          </GuardedLink>
        )}
        <h1 className="text-[26px] leading-[34px] font-semibold">{title}</h1>
        {subtitle && <p className="num text-[15px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
