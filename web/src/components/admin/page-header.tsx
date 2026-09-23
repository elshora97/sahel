import Link from "next/link";

import { buttonCls, linkCls } from "./ui";

export function PageHeader({ title, newHref, back }: { title: string; newHref?: string; back?: string }) {
  return (
    <div className="mb-6 space-y-1">
      {back && (
        <Link href={back} className={`${linkCls} text-sm`}>
          ← Back
        </Link>
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {newHref && (
          <Link href={newHref} className={buttonCls}>
            New
          </Link>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
