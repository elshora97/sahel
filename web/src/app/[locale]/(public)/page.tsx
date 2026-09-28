import { MapPin } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { CompoundStrip } from "@/components/public/compound-card";
import { Section } from "@/components/public/section";
import { UnitGrid } from "@/components/public/unit-card";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/admin/labels";
import { listAreas, listCompounds, searchUnits } from "@/lib/public/api";

const GUEST_CHOICES = [2, 4, 6, 8, 10];

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("public");

  const [areas, compounds, newest] = await Promise.all([listAreas(), listCompounds("size=60"), searchUnits("size=8")]);
  const featured = compounds.items.filter((c) => c.is_featured);
  const heroImage = featured.find((c) => c.cover_image_url)?.cover_image_url ?? newest.items.find((u) => u.cover_url)?.cover_url;

  return (
    <>
      <section className="pb-hero">
        {heroImage && <img className="pb-hero__img" src={heroImage} alt="" fetchPriority="high" />}
        <svg className="pb-hero__wave" viewBox="0 0 1200 56" preserveAspectRatio="none" aria-hidden="true">
          <path fill="currentColor" d="M0 28C150 4 300 4 450 28s300 24 450 0 300-24 300 0v28H0z" />
        </svg>
        <h1 className="pb-hero__title">{t("hero.title")}</h1>
        <p className="pb-hero__lede">{t("hero.lede")}</p>
        <form className="pb-search" action={`/${locale}/search`} method="get" role="search">
          <label className="pb-search__field">
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
          <label className="pb-search__field">
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
          <button type="submit" className={buttonClass("primary", "lg")}>
            {t("searchBar.submit")}
          </button>
        </form>
      </section>

      {featured.length > 0 && (
        <Section title={t("sections.featured")} lede={t("sections.featuredLede")}>
          <CompoundStrip compounds={featured} />
        </Section>
      )}

      {areas.length > 0 && (
        <Section title={t("sections.destinations")} id="destinations">
          <div className="pb-chips">
            {areas.map((a) => (
              <Link key={a.id} href={`/destinations/${a.slug}`} className="pb-chip pb-focus">
                <MapPin size={15} aria-hidden="true" />
                {pick(locale, a.name_ar, a.name_en)}
                <small className="num">{t("card.units", { count: a.unit_count })}</small>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {newest.items.length > 0 && (
        <Section
          title={t("sections.newest")}
          action={
            <Link href="/search" className={buttonClass("secondary")}>
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
