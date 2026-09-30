import type { ComponentProps, ReactNode } from "react";

import { Link } from "@/i18n/navigation";

const tileCls = "flex flex-col gap-1.5 rounded-md border border-line bg-surface p-5 text-ink";

/** A dashboard figure in the `stat` style: 40px, weight 200, tabular; `compact` (28px) fits money amounts. */
export function StatTile({
  label,
  value,
  note,
  href,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  href?: ComponentProps<typeof Link>["href"];
  compact?: boolean;
}) {
  const body = (
    <>
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={compact ? "num text-[28px] leading-[36px] font-light break-words" : "num text-[40px] leading-[44px] font-extralight"}>{value}</span>
      {note && <span className="num text-[13px] text-ink-muted">{note}</span>}
    </>
  );
  if (!href) return <div className={tileCls}>{body}</div>;
  return (
    <Link
      href={href}
      className={`${tileCls} hover:border-sea focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea`}
    >
      {body}
    </Link>
  );
}
