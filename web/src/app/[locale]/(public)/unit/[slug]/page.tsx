import { Bath, BedDouble, Building2, Check, ChevronRight, Ruler, Tag, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/admin/labels";
import { mergeAmenities } from "@/lib/public/amenities";
import { getCompound, getUnit } from "@/lib/public/api";
import { unitTransitionName } from "@/components/public/unit-card";
import { Gallery } from "./gallery";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const unit = await getUnit(slug);
  const cover = unit.images.find((i) => i.is_cover) ?? unit.images[0];
  const description = pick(locale, unit.description_ar, unit.description_en).slice(0, 160);
  return {
    title: pick(locale, unit.title_ar, unit.title_en),
    description,
    openGraph: cover ? { images: [cover.url] } : undefined,
    alternates: { languages: { ar: `/ar/unit/${slug}`, en: `/en/unit/${slug}` } },
  };
}

export default async function UnitPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("public");
  const enums = await getTranslations("enums");
  const unit = await getUnit(slug);
  const compound = await getCompound(unit.compound.slug, "size=1");

  const title = pick(locale, unit.title_ar, unit.title_en);
  const images = [...unit.images]
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort - b.sort)
    .map((i) => ({ url: i.url, alt: pick(locale, i.alt_ar, i.alt_en) }));
  const amenities = mergeAmenities(unit.amenities, compound.amenities);
  const description = pick(locale, unit.description_ar, unit.description_en);
  const rules = pick(locale, unit.house_rules_ar, unit.house_rules_en);
  const compoundName = pick(locale, unit.compound.name_ar, unit.compound.name_en);
  const location = [
    t("card.seaDistance", { meters: unit.sea_distance_m }),
    unit.row_number ? t("unit.row", { row: unit.row_number }) : null,
    enums(`view.${unit.view}`),
  ].filter(Boolean);

  const facts = [
    { icon: BedDouble, label: t("unit.bedrooms"), value: unit.bedrooms },
    { icon: Bath, label: t("unit.bathrooms"), value: unit.bathrooms },
    { icon: Users, label: t("unit.guests"), value: unit.max_guests },
    unit.area_sqm ? { icon: Ruler, label: t("unit.size"), value: t("unit.sizeValue", { sqm: unit.area_sqm }) } : null,
    unit.floor !== null ? { icon: Building2, label: t("unit.floor"), value: unit.floor } : null,
  ].filter((f) => f !== null);

  return (
    <article>
      <nav className="pb-crumbs" aria-label={t("nav.home")}>
        <Link href={`/destinations/${unit.area.slug}`}>{pick(locale, unit.area.name_ar, unit.area.name_en)}</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/compound/${unit.compound.slug}`}>{compoundName}</Link>
      </nav>
      <h1 className="pb-title">{title}</h1>
      <p className="pb-sub">
        {enums(`type.${unit.type}`)} · {location.join(" · ")}
      </p>

      <Gallery images={images} title={title} transitionName={unitTransitionName(unit.slug)} />

      <div className="pb-detail">
        <div style={{ display: "grid", gap: 48 }}>
          <section className="pb-block">
            <h2>{t("unit.details")}</h2>
            <dl className="pb-facts">
              {facts.map(({ icon: Icon, label, value }) => (
                <div key={label}>
                  <dt>
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {description && (
            <section className="pb-block">
              <h2>{t("unit.description")}</h2>
              <p>{description}</p>
            </section>
          )}

          {amenities.length > 0 && (
            <section className="pb-block">
              <h2>{t("unit.amenities")}</h2>
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

          {rules && (
            <section className="pb-block">
              <h2>{t("unit.rules")}</h2>
              <p>{rules}</p>
            </section>
          )}

          <section className="pb-block">
            <h2>{t("unit.compound")}</h2>
            <Link href={`/compound/${unit.compound.slug}`} className="pb-callout">
              <Building2 size={32} aria-hidden="true" style={{ color: "var(--sea-deep)", flex: "none" }} />
              <span>
                <strong>{compoundName}</strong>
                {enums(`beach_type.${compound.beach_type}`)}
              </span>
              <ChevronRight size={22} aria-hidden="true" style={{ marginInlineStart: "auto", flex: "none" }} className="pb-flip" />
            </Link>
          </section>
        </div>

        <aside className="pb-aside">
          <span className="pb-card__price" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Tag size={14} aria-hidden="true" />
            {t("unit.priceTitle")}
          </span>
          <h2>{title}</h2>
          <p>{t("unit.priceBody")}</p>
          <p className="num" style={{ color: "var(--ink)" }}>
            {location.join(" · ")}
          </p>
        </aside>
      </div>
    </article>
  );
}
