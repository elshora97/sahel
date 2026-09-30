import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { GuardedLink } from "@/components/admin/guarded-link";
import { PageHeader } from "@/components/admin/page-header";
import { TimelineGrid } from "@/components/admin/timeline-grid";
import { inputCls } from "@/components/admin/ui";
import { adminGet } from "@/lib/admin/api";
import { param, type SearchParams } from "@/lib/admin/filter";
import { addDays, parseFrom } from "@/lib/admin/timeline";
import type { Timeline } from "@/lib/admin/types";

const DAYS = 14;

/** Today's date in Cairo, the business's clock. */
function cairoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
}

export default async function TimelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const today = cairoToday();
  // A day before today leads, so a stay checking out today is still in view.
  const from = parseFrom(param(sp, "from"), addDays(today, -1));
  const [t, data] = await Promise.all([getTranslations("admin.timeline"), adminGet<Timeline>(`/timeline?from=${from}&days=${DAYS}`)]);
  const at = (day: string) => ({ pathname: "/dashboard/timeline", query: { from: day } });

  return (
    <>
      <PageHeader title={t("heading")} subtitle={t("subtitle")} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <GuardedLink href={at(addDays(from, -7))} className={buttonClass("secondary", "sm")} aria-label={t("prevWeek")}>
          <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span>
          <span className="max-sm:sr-only">{t("prevWeek")}</span>
        </GuardedLink>
        <GuardedLink href={at(addDays(today, -1))} className={buttonClass("quiet", "sm")}>
          {t("today")}
        </GuardedLink>
        <GuardedLink href={at(addDays(from, 7))} className={buttonClass("secondary", "sm")} aria-label={t("nextWeek")}>
          <span className="max-sm:sr-only">{t("nextWeek")}</span>
          <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>
        </GuardedLink>
        <form method="get" className="ms-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="tl-from">
            {t("jumpTo")}
          </label>
          <input id="tl-from" type="date" name="from" defaultValue={from} required className={`${inputCls} num min-h-9 w-auto py-1`} dir="ltr" />
          <button type="submit" className={buttonClass("secondary", "sm")}>
            {t("go")}
          </button>
        </form>
      </div>
      <TimelineGrid data={data} />
    </>
  );
}
