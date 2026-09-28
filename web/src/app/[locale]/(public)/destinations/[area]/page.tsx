import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CompoundStrip } from "@/components/public/compound-card";
import { Pagination } from "@/components/public/pagination";
import { Section } from "@/components/public/section";
import { UnitGrid } from "@/components/public/unit-card";
import { pick } from "@/lib/admin/labels";
import { getArea, searchUnits } from "@/lib/public/api";
import { parseSearchParams } from "@/lib/public/search-params";

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string; area: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, area } = await params;
  const a = await getArea(area);
  return { title: pick(locale, a.name_ar, a.name_en) };
}

export default async function DestinationPage({ params, searchParams }: Props) {
  const { locale, area } = await params;
  setRequestLocale(locale);
  const { page } = parseSearchParams(await searchParams);
  const t = await getTranslations("public");
  const enums = await getTranslations("enums");
  const [a, units] = await Promise.all([
    getArea(area),
    searchUnits(`area=${encodeURIComponent(area)}&size=${PAGE_SIZE}&page=${page}`),
  ]);
  const name = pick(locale, a.name_ar, a.name_en);

  return (
    <>
      <section className="pb-hero" style={{ minBlockSize: 300 }}>
        <svg className="pb-hero__wave" viewBox="0 0 1200 56" preserveAspectRatio="none" aria-hidden="true">
          <path fill="currentColor" d="M0 28C150 4 300 4 450 28s300 24 450 0 300-24 300 0v28H0z" />
        </svg>
        <h1 className="pb-hero__title">{name}</h1>
        <p className="pb-hero__lede num" style={{ marginBlockEnd: 0 }}>
          {[enums(`region.${a.region}`), a.km_marker ? t("destination.km", { km: a.km_marker }) : null].filter(Boolean).join(" · ")}
        </p>
      </section>

      {a.featured_compounds.length > 0 && (
        <Section title={t("destination.compounds", { name })}>
          <CompoundStrip compounds={a.featured_compounds} />
        </Section>
      )}

      <Section title={t("destination.units", { name })} lede={t("card.units", { count: units.total })}>
        {units.items.length > 0 && <UnitGrid units={units.items} />}
        <Pagination
          page={units.page}
          size={units.size}
          total={units.total}
          href={(p) => `/${locale}/destinations/${area}${p > 1 ? `?page=${p}` : ""}`}
        />
      </Section>
    </>
  );
}
