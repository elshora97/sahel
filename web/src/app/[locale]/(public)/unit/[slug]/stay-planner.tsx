"use client";

import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { addDays, addMonths, monthGrid, rangeSelect, weekdayOrder, type Range } from "@/lib/public/calendar";
import type { AvailabilityDay, QuoteResult } from "@/lib/public/types";
import { formatEGP } from "@/lib/utils";
import { loadAvailability, quoteStay } from "./stay-actions";

type Month = { year: number; month: number };
const monthStart = (m: Month) => `${m.year}-${String(m.month).padStart(2, "0")}-01`;
const monthEnd = (m: Month) => addDays(monthStart(addMonths(m.year, m.month, 1)), -1);

/**
 * Two months of dates, a check-in/check-out picker and the live price beside
 * it. Every range is priced by the API, which applies the booking rules.
 */
export function StayPlanner({
  slug,
  today,
  initial,
  maxGuests,
}: {
  slug: string;
  today: string;
  initial: AvailabilityDay[];
  maxGuests: number;
}) {
  const t = useTranslations("public");
  const locale = useLocale();
  const first: Month = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const [view, setView] = useState<Month>(first);
  const [days, setDays] = useState(() => new Map(initial.map((d) => [d.date, d])));
  const [range, setRange] = useState<Range>({});
  const [guests, setGuests] = useState(Math.min(2, maxGuests));
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, startLoading] = useTransition();
  const [quoting, startQuoting] = useTransition();

  const months = [view, addMonths(view.year, view.month, 1)];
  const intlLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  const num = useMemo(() => new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { maximumFractionDigits: 0 }), [locale]);
  const monthName = (m: Month) =>
    new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(m.year, m.month - 1, 1)));
  const weekdayName = (wd: number) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2027, 0, 3 + wd)));
  const longDate = (d: string) => new Intl.DateTimeFormat(intlLocale, { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  const go = (delta: number) => {
    const next = addMonths(view.year, view.month, delta);
    setView(next);
    const second = addMonths(next.year, next.month, 1);
    if (!days.has(monthStart(second)) || !days.has(monthStart(next))) {
      startLoading(async () => {
        const more = await loadAvailability(slug, monthStart(next), monthEnd(second));
        setDays((prev) => new Map([...prev, ...more.map((d) => [d.date, d] as const)]));
      });
    }
  };

  const requote = (r: Range, g: number) => {
    setQuote(null);
    if (!r.checkIn || !r.checkOut) return;
    startQuoting(async () => setQuote(await quoteStay(slug, r.checkIn!, r.checkOut!, g)));
  };

  const choose = (date: string) => {
    const next = rangeSelect(range, date);
    setRange(next);
    requote(next, guests);
  };

  const changeGuests = (g: number) => {
    setGuests(g);
    requote(range, g);
  };

  const inRange = (d: string) => !!range.checkIn && !!range.checkOut && d > range.checkIn && d < range.checkOut;
  const nightly = [...days.values()].find((d) => d.state === "free" && d.price !== null)?.price ?? null;
  const q = quote?.ok ? quote.quote : null;
  const hint = !range.checkIn ? t("calendar.pickCheckIn") : !range.checkOut ? t("calendar.pickCheckOut") : null;

  return (
    <section className="pb-stay pb-reveal" aria-labelledby="stay-title">
      <div className="pb-cal" data-loading={loading}>
        <div className="pb-cal__head">
          <h2 id="stay-title">{t("calendar.title")}</h2>
          <div className="pb-cal__nav">
            <button type="button" className="pb-cal__arrow" onClick={() => go(-1)} disabled={view.year === first.year && view.month === first.month} aria-label={t("calendar.prev")}>
              <ChevronLeft size={20} className="pb-flip" aria-hidden="true" />
            </button>
            <button type="button" className="pb-cal__arrow" onClick={() => go(1)} aria-label={t("calendar.next")}>
              <ChevronRight size={20} className="pb-flip" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="pb-cal__months">
          {months.map((m) => (
            <div key={monthStart(m)} className="pb-cal__month">
              <h3 className="pb-cal__name">{monthName(m)}</h3>
              <div className="pb-cal__grid" role="group" aria-label={monthName(m)}>
                {weekdayOrder.map((wd) => (
                  <span key={wd} className="pb-cal__wd" aria-hidden="true">
                    {weekdayName(wd)}
                  </span>
                ))}
                {monthGrid(m.year, m.month)
                  .flat()
                  .map((date, i) => {
                    if (!date) return <span key={`b${i}`} />;
                    const day = days.get(date);
                    const state = day?.state ?? "blocked";
                    const isEnd = date === range.checkIn || date === range.checkOut;
                    // A check-out needs no free night of its own, only a check-in does.
                    const selectable = range.checkIn && !range.checkOut && date > range.checkIn ? state !== "past" : state === "free";
                    const label = [longDate(date), day?.price != null && state === "free" ? formatEGP(day.price, locale) : null, t(`calendar.state.${state}`)]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <button
                        key={date}
                        type="button"
                        className="pb-cal__day"
                        data-state={state}
                        data-end={isEnd || undefined}
                        data-range={inRange(date) || undefined}
                        disabled={!selectable && !isEnd}
                        aria-pressed={isEnd}
                        aria-label={label}
                        onClick={() => choose(date)}
                      >
                        <span className="pb-cal__num num">{Number(date.slice(8))}</span>
                        {day?.price != null && state === "free" && <span className="pb-cal__px num">{num.format(day.price / 100)}</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <div className="pb-cal__legend" aria-hidden="true">
          <span>
            <i data-state="free" /> {t("calendar.state.free")}
          </span>
          <span>
            <i data-state="blocked" /> {t("calendar.state.blocked")}
          </span>
        </div>
        <p className="pb-cal__msg" role="status" data-error={quote && !quote.ok ? true : undefined}>
          {quote && !quote.ok ? t(`quote.errors.${quote.code}` as "quote.errors.unavailable") : hint}
        </p>
      </div>

      <aside className="pb-quote" aria-live="polite" aria-busy={quoting}>
        <p className="pb-quote__price">
          {nightly !== null ? (
            <>
              <strong className="num">{formatEGP(nightly, locale)}</strong> {t("calendar.perNight")}
            </>
          ) : (
            t("unit.priceTitle")
          )}
        </p>

        <div className="pb-quote__dates">
          <div>
            <span>{t("calendar.checkIn")}</span>
            <strong className="num">{range.checkIn ? longDate(range.checkIn) : "—"}</strong>
          </div>
          <div>
            <span>{t("calendar.checkOut")}</span>
            <strong className="num">{range.checkOut ? longDate(range.checkOut) : "—"}</strong>
          </div>
          {range.checkIn && (
            <button
              type="button"
              className="pb-quote__clear"
              onClick={() => {
                setRange({});
                setQuote(null);
              }}
              aria-label={t("calendar.clear")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="pb-stepper" role="group" aria-label={t("filters.guests")}>
          <span className="pb-label" style={{ margin: 0 }}>
            {t("filters.guests")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" onClick={() => changeGuests(guests - 1)} disabled={guests <= 1} aria-label={t("filters.decrease", { label: t("filters.guests") })}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <output className="num">{guests}</output>
            <button type="button" onClick={() => changeGuests(guests + 1)} disabled={guests >= maxGuests} aria-label={t("filters.increase", { label: t("filters.guests") })}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {quoting && <div className="pb-skel" style={{ blockSize: 110 }} />}
        {q && !quoting && (
          <dl className="pb-quote__lines num">
            <div>
              <dt>{t("quote.nights", { count: q.night_count, price: formatEGP(q.nightly_price, locale) })}</dt>
              <dd>{formatEGP(q.subtotal, locale)}</dd>
            </div>
            {q.cleaning_fee > 0 && (
              <div>
                <dt>{t("quote.cleaning")}</dt>
                <dd>{formatEGP(q.cleaning_fee, locale)}</dd>
              </div>
            )}
            <div className="pb-quote__total">
              <dt>{t("quote.total")}</dt>
              <dd>{formatEGP(q.total, locale)}</dd>
            </div>
            <div className="pb-quote__due">
              <dt>{t("quote.deposit")}</dt>
              <dd>{formatEGP(q.deposit_due, locale)}</dd>
            </div>
          </dl>
        )}

        <button type="button" className="bs-btn bs-btn--primary bs-btn--lg bs-btn--block" disabled>
          {t("quote.cta")}
        </button>
        <p className="pb-quote__note">{t("quote.ctaNote")}</p>
      </aside>
    </section>
  );
}
