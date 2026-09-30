"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { addMonths, monthGrid, rangeSelect, weekdayOrder, type Range } from "@/lib/public/calendar";
import { canPick, isTaken, type Taken } from "@/lib/admin/stay-picker";
import { cn } from "@/lib/utils";

/**
 * Two months (one on phones) for choosing a manual booking's check-in and
 * check-out. Booked, turnover and blocked nights are struck through and
 * can't start a stay; after a check-in, only days up to the next closed
 * night can end it.
 */
export function StayPicker({
  taken,
  value,
  onChange,
  loading = false,
  today,
}: {
  taken: Taken;
  value: Range;
  onChange: (r: Range) => void;
  loading?: boolean;
  today: string;
}) {
  const t = useTranslations("admin.bookings.manual");
  const locale = useLocale();
  const intl = locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  const start = value.checkIn ?? today;
  const [view, setView] = useState({ year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) });
  const months = [view, addMonths(view.year, view.month, 1)];
  const monthLabel = (y: number, m: number) =>
    new Intl.DateTimeFormat(intl, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  const dayLabel = (d: string) => new Intl.DateTimeFormat(intl, { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const weekdays = weekdayOrder.map((wd) =>
    new Intl.DateTimeFormat(intl, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2027, 0, 3 + wd))),
  );
  const pickingOut = !!value.checkIn && !value.checkOut;

  return (
    <div className={cn("sp", loading && "opacity-60")} aria-busy={loading}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="sp-nav" aria-label={t("prevMonth")} onClick={() => setView(addMonths(view.year, view.month, -1))}>
          <span aria-hidden="true" className="inline-block rtl:rotate-180">‹</span>
        </button>
        <p className="text-sm text-ink-muted" aria-live="polite">
          {pickingOut ? t("pickCheckOut") : t("pickCheckIn")}
        </p>
        <button type="button" className="sp-nav" aria-label={t("nextMonth")} onClick={() => setView(addMonths(view.year, view.month, 1))}>
          <span aria-hidden="true" className="inline-block rtl:rotate-180">›</span>
        </button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {months.map(({ year, month }, i) => (
          <div key={`${year}-${month}`} className={cn(i === 1 && "max-sm:hidden")}>
            <p className="mb-2 text-center font-medium">{monthLabel(year, month)}</p>
            <div className="sp-grid" role="grid" aria-label={monthLabel(year, month)}>
              {weekdays.map((w, k) => (
                <span key={k} className="sp-wd" aria-hidden="true">
                  {w}
                </span>
              ))}
              {monthGrid(year, month)
                .flat()
                .map((d, k) => {
                  if (!d) return <span key={k} />;
                  const closed = isTaken(d, taken);
                  const ok = !loading && canPick(d, value.checkIn, value.checkOut, taken);
                  const edge = d === value.checkIn || d === value.checkOut;
                  const inside = !!value.checkIn && !!value.checkOut && d > value.checkIn && d < value.checkOut;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={!ok}
                      aria-pressed={edge}
                      aria-label={`${dayLabel(d)}${closed ? ` · ${t("closed")}` : ""}`}
                      data-closed={closed || undefined}
                      data-in-range={inside || undefined}
                      data-today={d === today || undefined}
                      className="sp-day num"
                      onClick={() => onChange(rangeSelect(value, d))}
                    >
                      {Number(d.slice(8))}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
        <span className="sp-day sp-legend" data-closed aria-hidden="true" />
        {t("closedLegend")}
      </p>
    </div>
  );
}
