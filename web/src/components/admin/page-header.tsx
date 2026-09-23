import type { ReactNode } from "react";

import { GuardedLink } from "./guarded-link";
import { linkCls } from "./ui";

/** Title row from the app design: `heading` h1 (+ optional badge beside it), muted subtitle, actions at the end edge. */
export function PageHeader({
  title,
  badge,
  subtitle,
  actions,
  back,
}: {
  title: string;
  badge?: ReactNode;
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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] leading-[34px] font-semibold">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="num text-[15px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
