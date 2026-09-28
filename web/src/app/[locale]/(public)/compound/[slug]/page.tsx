import { Check, DoorOpen, Waves } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Pagination } from "@/components/public/pagination";
import { Section } from "@/components/public/section";
import { UnitGrid } from "@/components/public/unit-card";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/admin/labels";
import { getCompound } from "@/lib/public/api";
import { parseSearchParams } from "@/lib/public/search-params";

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const c = await getCompound(slug, "size=1");
  return {
    title: pick(locale, c.name_ar, c.name_en),
    description: pick(locale, c.description_ar, c.description_en).slice(0, 160),
    openGraph: c.cover_image_url ? { images: [c.cover_image_url] } : undefined,
  };
}

export default async function CompoundPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const { page } = parseSearchParams(await searchParams);
  const t = await getTranslations("public");
  const enums = await getTranslations("enums");
  const c = await getCompound(slug, `size=${PAGE_SIZE}&page=${page}`);

  const name = pick(locale, c.name_ar, c.name_en);
  const areaName = pick(locale, c.area.name_ar, c.area.name_en);
  const description = pick(locale, c.description_ar, c.description_en);
  const gate = pick(locale, c.gate_info_ar, c.gate_info_en);
  const amenities = (c.amenities ?? []).filter((a) => a.trim());

  return (
    <article>
      <nav className="pb-crumbs" aria-label={t("nav.home")}>
        <Link href={`/destinations/${c.area.slug}`}>{areaName}</Link>
      </nav>
      <h1 className="pb-title">{name}</h1>
      <p className="pb-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Waves size={18} aria-hidden="true" style={{ color: "var(--sea-deep)" }} />
        {t("compound.beach")}: {enums(`beach_type.${c.beach_type}`)}
      </p>
      <div className="pb-cover">{c.cover_image_url && <img src={c.cover_image_url} alt="" />}</div>

      <div className="pb-detail">
        <div style={{ display: "grid", gap: 48 }}>
          {description && (
            <section className="pb-block">
              <h2>{t("compound.about")}</h2>
              <p>{description}</p>
            </section>
          )}
          {amenities.length > 0 && (
            <section className="pb-block">
              <h2>{t("compound.amenities")}</h2>
              <ul className="pb-amenities">
                {amenities.map((a) => (
                  <li key={a}>
                    <Check size={18} aria-hidden="true" />
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {gate && (
          <aside className="pb-aside">
            <DoorOpen size={28} aria-hidden="true" style={{ color: "var(--sea-deep)" }} />
            <h2>{t("compound.gate")}</h2>
            <p style={{ whiteSpace: "pre-line" }}>{gate}</p>
          </aside>
        )}
      </div>

      <Section title={t("compound.units", { name })} lede={t("card.units", { count: c.units.total })}>
        {c.units.items.length > 0 && <UnitGrid units={c.units.items} place={`${name} · ${areaName}`} />}
        <Pagination
          page={c.units.page}
          size={c.units.size}
          total={c.units.total}
          href={(p) => `/${locale}/compound/${slug}${p > 1 ? `?page=${p}` : ""}`}
        />
      </Section>
    </article>
  );
}
