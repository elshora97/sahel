import { getTranslations, setRequestLocale } from "next-intl/server";

import { CompoundStrip } from "@/components/public/compound-card";
import { Section } from "@/components/public/section";
import { UnitGrid } from "@/components/public/unit-card";
import { WeekendIndex, type WeekendPage } from "@/components/public/weekend-index";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/admin/labels";
import { listAreas, listCompounds, searchUnits, tryAvailability } from "@/lib/public/api";
import type { UnitCardData } from "@/lib/public/types";
import { upcomingWeekends, weekendStay } from "@/lib/public/weekends";
import { formatEGP } from "@/lib/utils";

const GUEST_CHOICES = [2, 4, 6, 8, 10];
const WEEKENDS = 4;
/** Units checked for the weekend index. Each costs one availability call. */
const INDEX_UNITS = 24;

function intlLocale(locale: string) {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
}

/** Each upcoming weekend with the units free all three nights, nearest the sea first. */
async function weekendPages(locale: string, units: UnitCardData[]): Promise<WeekendPage[]> {
  const weekends = upcomingWeekends(WEEKENDS);
  const from = weekends[0].checkIn;
  const to = weekends[weekends.length - 1].checkOut;
  const calendars = await Promise.all(units.map((u) => tryAvailability(u.slug, from, to)));
  const range = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", day: "numeric", month: "long" });

  return weekends.map((w) => {
    const free = units.flatMap((u, i) => {
      const days = calendars[i];
      const stay = days ? weekendStay(days, w) : null;
      if (!stay?.free) return [];
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
      dates: range.formatRange(new Date(`${w.checkIn}T00:00:00Z`), new Date(`${w.checkOut}T00:00:00Z`)),
      units: free.sort((a, b) => a.sea - b.sea),
    };
  });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("public");

  const [areas, compounds, newest, indexUnits] = await Promise.all([
    listAreas(),
    listCompounds("size=60"),
    searchUnits("size=8"),
    searchUnits(`size=${INDEX_UNITS}`),
  ]);
  const weekends = await weekendPages(locale, indexUnits.items);
  const featured = compounds.items.filter((c) => c.is_featured);
  const cover =
    featured.find((c) => c.cover_image_url)?.cover_image_url ?? newest.items.find((u) => u.cover_url)?.cover_url ?? null;
  const byKm = [...areas].sort((a, b) => (a.km_marker ?? Infinity) - (b.km_marker ?? Infinity) || a.sort_order - b.sort_order);

  return (
    <>
      <section className="fo-cover" data-photo={cover ? "true" : "false"}>
        {cover && <img className="fo-cover__img" src={cover} alt="" fetchPriority="high" />}
        <div className="fo-cover__words">
          <h1 className="fo-cover__title">{t("hero.title")}</h1>
          <p className="fo-cover__lede">{t("hero.lede")}</p>
        </div>
      </section>

      <form className="fo-search" action={`/${locale}/search`} method="get" role="search">
        <label className="fo-search__field">
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
        <label className="fo-search__field">
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
        <button type="submit" className="fo-btn fo-btn--primary">
          {t("searchBar.submit")}
        </button>
      </form>

      <WeekendIndex weekends={weekends} locale={locale} />

      {areas.length > 0 && (
        <Section title={t("sections.destinations")} id="destinations">
          <ol className="fo-contents">
            {byKm.map((a) => (
              <li key={a.id}>
                <Link href={`/destinations/${a.slug}`} className="fo-contents__row">
                  <span className="fo-contents__name">{pick(locale, a.name_ar, a.name_en)}</span>
                  <span className="fo-contents__leader" aria-hidden="true" />
                  <span className="fo-contents__meta num">
                    {a.km_marker != null && <span>{t("weekend.km", { km: a.km_marker })}</span>}
                    <span>{t("card.units", { count: a.unit_count })}</span>
                  </span>
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
            <Link href="/search" className="fo-link">
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
