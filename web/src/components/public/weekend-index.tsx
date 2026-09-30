"use client";

import { Waves } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export interface WeekendUnit {
  slug: string;
  title: string;
  place: string;
  sea: number;
  total: string | null;
  cover: string | null;
}

export interface WeekendPage {
  checkIn: string;
  /** "1 – 4 October", already in the page's locale. */
  dates: string;
  units: WeekendUnit[];
}

const SHOWN = 4;

/**
 * The home page's index of places free each upcoming weekend. A row of
 * weekends to choose from, then the places free all three nights.
 */
export function WeekendIndex({ weekends, locale }: { weekends: WeekendPage[]; locale: string }) {
  const t = useTranslations("public.weekend");
  const card = useTranslations("public.card");
  const [index, setIndex] = useState(0);
  const week = weekends[index];

  return (
    <section className="fo-index" aria-labelledby="fo-index-title">
      <header className="fo-index__head">
        <h2 id="fo-index-title" className="fo-index__title">
          {t("title")}
        </h2>
        <div className="fo-weeks" role="group" aria-label={t("choose")}>
          {weekends.map((w, i) => (
            <button
              key={w.checkIn}
              type="button"
              className="fo-week"
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              <span className="fo-week__name">{t("tab", { index: i })}</span>
              <span className="fo-week__dates num">{w.dates}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="fo-index__body" key={week.checkIn}>
        <p className="fo-index__count" aria-live="polite">
          <span>{t("free", { count: week.units.length })}</span>
          <span className="fo-index__stay">{t("stay")}</span>
        </p>

        {week.units.length === 0 ? (
          <p className="fo-index__none">{t("none")}</p>
        ) : (
          <ul className="fo-rows">
            {week.units.slice(0, SHOWN).map((u) => (
              <li key={u.slug}>
                <a className="fo-row" href={`/${locale}/unit/${u.slug}`}>
                  <span className="fo-row__photo">
                    {u.cover && <img src={u.cover} alt="" loading="lazy" decoding="async" />}
                  </span>
                  <span className="fo-row__text">
                    <span className="fo-row__title">{u.title}</span>
                    {u.place && <span className="fo-row__place">{u.place}</span>}
                    <span className="fo-row__sea num">
                      <Waves size={15} strokeWidth={1.5} aria-hidden="true" />
                      {card("seaDistance", { meters: u.sea })}
                    </span>
                  </span>
                  <span className="fo-row__price num">{u.total ? t("total", { price: u.total }) : t("noPrice")}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <footer className="fo-index__foot">
          {week.units.length > SHOWN && <span className="num">{t("more", { count: week.units.length - SHOWN })}</span>}
          <a className="fo-link" href={`/${locale}/search`}>
            {t("seeAll")}
          </a>
        </footer>
        <p className="fo-index__note">{t("note")}</p>
      </div>
    </section>
  );
}
