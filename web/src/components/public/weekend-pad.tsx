"use client";

import { ArrowUpRight, RotateCcw, Scissors, Waves } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export interface PadDay {
  date: string;
  weekday: string;
  day: string;
  friday: boolean;
  checkout: boolean;
}

export interface PadUnit {
  slug: string;
  title: string;
  place: string;
  sea: number;
  total: string | null;
  cover: string | null;
}

export interface PadSheet {
  checkIn: string;
  month: string;
  days: PadDay[];
  units: PadUnit[];
}

const SHOWN = 4;
const TEAR_MS = 420;

/**
 * The home page's tear-off calendar: one sheet per upcoming weekend. Tearing
 * the top sheet reveals the next weekend underneath; the sheets left on the
 * pad are drawn as its thickness.
 */
export function WeekendPad({ sheets, locale }: { sheets: PadSheet[]; locale: string }) {
  const t = useTranslations("public.pad");
  const card = useTranslations("public.card");
  const [index, setIndex] = useState(0);
  const [tearing, setTearing] = useState(false);

  const sheet = sheets[index];
  const last = index === sheets.length - 1;
  const left = sheets.length - index - 1;

  function tear() {
    if (last || tearing) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setIndex((i) => i + 1);
      return;
    }
    setTearing(true);
    window.setTimeout(() => {
      setIndex((i) => i + 1);
      setTearing(false);
    }, TEAR_MS);
  }

  return (
    <section className="nt-pad" aria-label={t("label")} data-left={Math.min(left, 3)}>
      <div className="nt-pad__under" aria-hidden="true">
        {Array.from({ length: Math.min(left, 3) }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <article className="nt-sheet" data-tearing={tearing || undefined} key={sheet.checkIn}>
        <div className="nt-sheet__perf" aria-hidden="true" />
        <header className="nt-sheet__head">
          <h2 className="nt-sheet__when">
            {t("sheet", { index })}
          </h2>
          <span className="nt-sheet__month num">{sheet.month}</span>
        </header>

        <ol className="nt-days">
          {sheet.days.map((d) => (
            <li key={d.date} className="nt-day" data-friday={d.friday || undefined} data-checkout={d.checkout || undefined}>
              <span className="nt-day__num num">{d.day}</span>
              <span className="nt-day__name">{d.checkout ? t("checkout") : d.weekday}</span>
            </li>
          ))}
        </ol>

        <p className="nt-sheet__count" aria-live="polite">
          {t("free", { count: sheet.units.length })}
        </p>
        {sheet.units.length > 0 ? (
          <p className="nt-sheet__lede">{t("freeLede")}</p>
        ) : (
          <p className="nt-sheet__lede">{last ? t("lastSheet") : t("allBooked")}</p>
        )}

        {sheet.units.length > 0 && (
          <ul className="nt-rows">
            {sheet.units.slice(0, SHOWN).map((u) => (
              <li key={u.slug}>
                <a className="nt-row" href={`/${locale}/unit/${u.slug}`}>
                  <span className="nt-row__photo">{u.cover && <img src={u.cover} alt="" loading="lazy" decoding="async" />}</span>
                  <span className="nt-row__text">
                    <span className="nt-row__title">{u.title}</span>
                    {u.place && <span className="nt-row__place">{u.place}</span>}
                  </span>
                  <span className="nt-row__sea num">
                    <Waves size={15} strokeWidth={1.5} aria-hidden="true" />
                    {card("seaDistance", { meters: u.sea })}
                  </span>
                  <span className="nt-row__price num">{u.total ? t("total", { price: u.total }) : t("noPrice")}</span>
                  <ArrowUpRight className="nt-row__go" size={18} strokeWidth={1.5} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}

        <footer className="nt-sheet__foot">
          {sheet.units.length > SHOWN && <span className="nt-sheet__more num">{t("more", { count: sheet.units.length - SHOWN })}</span>}
          <a className="nt-link" href={`/${locale}/search`}>
            {t("seeAll")}
          </a>
          <span className="nt-sheet__actions">
            {index > 0 && (
              <button type="button" className="nt-btn nt-btn--quiet" onClick={() => setIndex((i) => i - 1)} disabled={tearing}>
                <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />
                {t("back")}
              </button>
            )}
            <button type="button" className="nt-btn nt-btn--tear" onClick={tear} disabled={last || tearing} title={t("tearLabel")}>
              <Scissors size={16} strokeWidth={1.5} aria-hidden="true" />
              {t("tear")}
            </button>
          </span>
        </footer>
        <p className="nt-sheet__note">{t("note")}</p>
      </article>
    </section>
  );
}
