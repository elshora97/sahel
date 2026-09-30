import { getTranslations, setRequestLocale } from "next-intl/server";

import { CompoundStrip } from "@/components/public/compound-card";
import { Section } from "@/components/public/section";
import { UnitGrid } from "@/components/public/unit-card";
import { WeekendPad, type PadSheet } from "@/components/public/weekend-pad";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/admin/labels";
import { listAreas, listCompounds, searchUnits, tryAvailability } from "@/lib/public/api";
import { upcomingWeekends, weekendStay } from "@/lib/public/weekends";
import { formatEGP } from "@/lib/utils";

const GUEST_CHOICES = [2, 4, 6, 8, 10];
const SHEETS = 4;
/** Units checked for the pad. Enough to fill a sheet; each costs one availability call. */
const PAD_UNITS = 24;

function intlLocale(locale: string) {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
}

/** One sheet per upcoming weekend, each listing the units free all three nights. */
async function padSheets(locale: string): Promise<PadSheet[]> {
  const weekends = upcomingWeekends(SHEETS);
  const units = (await searchUnits(`size=${PAD_UNITS}`)).items;
  const from = weekends[0].checkIn;
  const to = weekends[weekends.length - 1].checkOut;
  const calendars = await Promise.all(units.map((u) => tryAvailability(u.slug, from, to)));

  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", ...opts });
  const month = fmt({ month: "long" });
  const year = fmt({ year: "numeric" });
  const weekday = fmt({ weekday: "long" });

  return weekends.map((w) => {
    const dates = [...w.nights, w.checkOut].map((d) => new Date(`${d}T00:00:00Z`));
    const first = dates[0];
    const lastDay = dates[dates.length - 1];
    const months =
      first.getUTCMonth() === lastDay.getUTCMonth() ? month.format(first) : `${month.format(first)} – ${month.format(lastDay)}`;

    const free = units.flatMap((u, i) => {
      const days = calendars[i];
      if (!days) return [];
      const stay = weekendStay(days, w);
      if (!stay.free) return [];
      return [
        {
          slug: u.slug,
          title: pick(locale, u.title_ar, u.title_en),
          place: [pick(locale, u.compound_name_ar, u.compound_name_en), pick(locale, u.area_name_ar, u.area_name_en)]
            .filter(Boolean)
            .join(" · "),
          sea: u.sea_distance_m,
          total: stay.total == null ? null : formatEGP(stay.total, locale),
          cover: u.cover_url,
        },
      ];
    });

    return {
      checkIn: w.checkIn,
      month: `${months} ${year.format(first)}`,
      days: dates.map((d, i) => ({
        date: d.toISOString().slice(0, 10),
        weekday: weekday.format(d),
        day: String(d.getUTCDate()),
        friday: d.getUTCDay() === 5,
        checkout: i === dates.length - 1,
      })),
      units: free.sort((a, b) => a.sea - b.sea),
    };
  });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("public");

  const [areas, compounds, newest, sheets] = await Promise.all([
    listAreas(),
    listCompounds("size=60"),
    searchUnits("size=8"),
    padSheets(locale),
  ]);
  const featured = compounds.items.filter((c) => c.is_featured);
  const byKm = [...areas].sort((a, b) => (a.km_marker ?? Infinity) - (b.km_marker ?? Infinity) || a.sort_order - b.sort_order);

  return (
    <>
      <section className="nt-board">
        <span className="nt-board__hole" aria-hidden="true" />
        <div className="nt-board__head">
          <h1 className="nt-board__title">{t("hero.title")}</h1>
          <p className="nt-board__lede">{t("hero.lede")}</p>
          <form className="nt-search" action={`/${locale}/search`} method="get" role="search">
            <label className="nt-search__field">
              <span>{t("searchBar.where")}</span>
              <select name="area" defaultValue="">
                <option value="">{t("searchBar.anywhere")}</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.slug}>
                    {pick(locale, a.name_ar, a.name_en)}
                  </option>
                ))}
              </select>
            </label>
            <label className="nt-search__field">
              <span>{t("searchBar.guests")}</span>
              <select name="guests" defaultValue="">
                <option value="">{t("searchBar.anyGuests")}</option>
                {GUEST_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {t("filters.atLeast", { count: n })}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="nt-btn nt-btn--primary">
              {t("searchBar.submit")}
            </button>
          </form>
        </div>
        <WeekendPad sheets={sheets} locale={locale} />
      </section>

      {areas.length > 0 && (
        <Section title={t("sections.destinations")} id="destinations">
          <ol className="nt-road">
            {byKm.map((a) => (
              <li key={a.id}>
                <Link href={`/destinations/${a.slug}`} className="nt-road__row">
                  <span className="nt-road__km num">{a.km_marker != null && t("pad.km", { km: a.km_marker })}</span>
                  <span className="nt-road__name">{pick(locale, a.name_ar, a.name_en)}</span>
                  <span className="nt-road__count num">{t("card.units", { count: a.unit_count })}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {featured.length > 0 && (
        <Section title={t("sections.featured")} lede={t("sections.featuredLede")}>
          <CompoundStrip compounds={featured} />
        </Section>
      )}

      {newest.items.length > 0 && (
        <Section
          title={t("sections.newest")}
          action={
            <Link href="/search" className="nt-link">
              {t("sections.seeAll")}
            </Link>
          }
        >
          <UnitGrid units={newest.items} />
        </Section>
      )}
    </>
  );
}
