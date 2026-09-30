import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { StatTile } from "@/components/ds/stat-tile";
import { StateBadge } from "@/components/ds/state-badge";
import { bookingStatusTone, pick } from "@/lib/admin/labels";
import type { Movement, Today } from "@/lib/admin/types";
import { formatPhone } from "@/lib/public/phone";
import { GuardedLink } from "./guarded-link";
import { RowLink } from "./row-link";
import { linkCls } from "./ui";

/** The dashboard's first section: who arrives and leaves today, and how full the week is. */
export async function TodayPanel({ today, pendingPayments, locale }: { today: Today; pendingPayments: number; locale: string }) {
  const [t, status] = await Promise.all([getTranslations("admin.today"), getTranslations("public.bookingStatus")]);
  const dateLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today.today}T00:00:00Z`));
  const pct = today.week_nights > 0 ? Math.round((today.occupied_nights / today.week_nights) * 100) : 0;

  const list = (rows: Movement[], empty: string) =>
    rows.length === 0 ? (
      <p className="px-6 py-8 text-center text-sm text-ink-muted">{empty}</p>
    ) : (
      <ul>
        {rows.map((m) => (
          <li
            key={m.id}
            className="relative flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-6 py-3 first:border-t-0 hover:bg-sea-soft/60 focus-within:bg-sea-soft"
          >
            <span className="min-w-0 flex-1">
              <RowLink href={`/dashboard/bookings/${m.id}`} primary={m.customer_name} secondary={pick(locale, m.unit_title_ar, m.unit_title_en)} />
            </span>
            <span className="num text-sm text-ink-muted">
              {t("nights", { count: m.nights })} · {t("guests", { count: m.guests })}
            </span>
            <a href={`tel:${m.customer_phone}`} className={`${linkCls} num relative z-10 text-sm`} dir="ltr" aria-label={t("call", { name: m.customer_name })}>
              {formatPhone(m.customer_phone)}
            </a>
            <StateBadge tone={bookingStatusTone(m.status)}>{status(m.status as "confirmed")}</StateBadge>
          </li>
        ))}
      </ul>
    );

  return (
    <section aria-labelledby="today-heading" className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="today-heading" className="text-xl font-semibold">
          {t("heading")}
        </h2>
        <span className="text-sm text-ink-muted">{dateLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label={t("arrivals")} value={today.arrivals.length} href="#today-arrivals" />
        <StatTile label={t("departures")} value={today.departures.length} href="#today-departures" />
        <StatTile label={t("staying")} value={today.staying_tonight} href="/dashboard/timeline" />
        <StatTile
          label={t("toCheck")}
          value={pendingPayments}
          note={today.holds_expiring > 0 ? t("holdsExpiring", { count: today.holds_expiring }) : undefined}
          href="/dashboard/payments"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="today-arrivals" title={t("arrivals")} padded={false}>
          {list(today.arrivals, t("noArrivals"))}
        </Card>
        <Card id="today-departures" title={t("departures")} padded={false}>
          {list(today.departures, t("noDepartures"))}
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-ink-muted">{t("occupancy")}</p>
            <p className="num text-[40px] leading-[44px] font-extralight">{pct}%</p>
          </div>
          <GuardedLink href="/dashboard/timeline" className={`${linkCls} text-sm`}>
            {t("openTimeline")}
          </GuardedLink>
        </div>
        <div
          className="mt-4 h-3 overflow-hidden rounded-full bg-sea-soft"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t("occupancy")}
        >
          <div className="h-full rounded-full bg-sea-deep transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="num mt-2 text-[13px] text-ink-muted">{t("occupancyNote", { booked: today.occupied_nights, total: today.week_nights })}</p>
      </Card>
    </section>
  );
}
