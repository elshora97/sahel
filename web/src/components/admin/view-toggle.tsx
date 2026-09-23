import { getTranslations } from "next-intl/server";

import type { SearchParams } from "@/lib/admin/filter";
import { param } from "@/lib/admin/filter";
import { cn } from "@/lib/utils";
import { GuardedLink } from "./guarded-link";
import { focusRing } from "./ui";

/** Table/Grid switch for the units list. Links, so the view stays in the URL with the filters. */
export async function ViewToggle({ pathname, sp, current }: { pathname: string; sp: SearchParams; current: "grid" | "table" }) {
  const t = await getTranslations("admin.units");
  const query = (view: "grid" | "table") => {
    const q: Record<string, string> = {};
    for (const key of Object.keys(sp)) {
      const value = param(sp, key);
      if (value && !["view", "done", "name"].includes(key)) q[key] = value;
    }
    if (view === "table") q.view = "table"; // grid is the default
    return q;
  };

  return (
    <div role="group" aria-label={t("viewLabel")} className="inline-flex rounded-md border border-line-control bg-surface p-0.5">
      {(["grid", "table"] as const).map((view) => (
        <GuardedLink
          key={view}
          href={{ pathname, query: query(view) }}
          aria-current={current === view ? "page" : undefined}
          className={cn(
            "rounded-[6px] px-3 py-1.5 text-sm font-medium",
            focusRing,
            current === view ? "bg-sea-soft text-sea-deep" : "text-ink hover:bg-sea-soft/60",
          )}
        >
          {view === "grid" ? t("viewGrid") : t("viewTable")}
        </GuardedLink>
      ))}
    </div>
  );
}
