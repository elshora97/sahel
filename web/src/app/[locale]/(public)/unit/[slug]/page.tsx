import { Bath, BedDouble, Building2, Check, ChevronRight, Navigation, Ruler, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/admin/labels";
import { mergeAmenities } from "@/lib/public/amenities";
import { getAvailability, getCompound, getUnit } from "@/lib/public/api";
import { currentGuest } from "@/lib/public/guest";
import { addDays, addMonths } from "@/lib/public/calendar";
import { directionsUrl } from "@/components/maps/map-pin";
import { UnitMap } from "@/components/maps/unit-map";
import { unitTransitionName } from "@/components/public/unit-card";
import { Gallery } from "./gallery";
import { StayPlanner } from "./stay-planner";

/** Today on the coast, as YYYY-MM-DD. */
const cairoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

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
  const today = cairoToday();
  const next = addMonths(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 2);
  const [compound, availability, guest] = await Promise.all([
    getCompound(unit.compound.slug, "size=1"),
    getAvailability(slug, `${today.slice(0, 7)}-01`, addDays(`${next.year}-${String(next.month).padStart(2, "0")}-01`, -1)),
    currentGuest(),
  ]);

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

      <StayPlanner slug={unit.slug} today={today} initial={availability} maxGuests={unit.max_guests} title={title} signedIn={!!guest} />

      <div className="pb-detail" style={{ gridTemplateColumns: "minmax(0, 1fr)", maxInlineSize: 820 }}>
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

          {unit.lat != null && unit.lng != null && (
            <section className="pb-block">
              <h2>{t("unit.onMap")}</h2>
              <UnitMap lat={unit.lat} lng={unit.lng} label={t("unit.mapLabel", { title })} />
              <a href={directionsUrl(unit.lat, unit.lng)} target="_blank" rel="noopener noreferrer" className="pb-map-link">
                <Navigation size={16} aria-hidden="true" />
                {t("unit.directions")}
              </a>
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

      </div>
    </article>
  );
}
