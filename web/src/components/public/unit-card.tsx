import { BedDouble, Users, Waves } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { pick } from "@/lib/admin/labels";
import type { UnitCardData } from "@/lib/public/types";

/** Shared by the card photo and the unit gallery, so the photo morphs between them. */
export const unitTransitionName = (slug: string) => `unit-${slug.replace(/[^a-z0-9-]/gi, "")}`;

/**
 * One unit in a grid. A plain <a> on purpose: a document navigation lets the
 * browser's cross-document view transition carry the photo into the page.
 */
export async function UnitCard({ unit, place }: { unit: UnitCardData; place?: string }) {
  const locale = await getLocale();
  const t = await getTranslations("public.card");
  const enums = await getTranslations("enums");
  const title = pick(locale, unit.title_ar, unit.title_en);
  const where =
    place ??
    [pick(locale, unit.compound_name_ar, unit.compound_name_en), pick(locale, unit.area_name_ar, unit.area_name_en)]
      .filter(Boolean)
      .join(" · ");

  return (
    <a href={`/${locale}/unit/${unit.slug}`} className="pb-card">
      <div className="pb-card__photo" style={{ viewTransitionName: unitTransitionName(unit.slug) }}>
        {unit.cover_url ? (
          <img src={unit.cover_url} alt="" loading="lazy" decoding="async" width={640} height={480} />
        ) : (
          <span className="pb-card__empty">{t("noPhoto")}</span>
        )}
        <span className="pb-card__tag">{enums(`type.${unit.type}`)}</span>
      </div>
      <div>
        <h3 className="pb-card__title">{title}</h3>
        {where && <p className="pb-card__place">{where}</p>}
      </div>
      <p className="pb-card__facts num">
        <span>
          <BedDouble size={16} aria-hidden="true" />
          {t("bedrooms", { count: unit.bedrooms })}
        </span>
        <span>
          <Users size={16} aria-hidden="true" />
          {t("guests", { count: unit.max_guests })}
        </span>
        <span>
          <Waves size={16} aria-hidden="true" />
          {t("seaDistance", { meters: unit.sea_distance_m })}
        </span>
      </p>
      <span className="pb-card__price">{t("priceSoon")}</span>
    </a>
  );
}

export function UnitGrid({ units, place }: { units: UnitCardData[]; place?: string }) {
  return (
    <div className="pb-grid">
      {units.map((u) => (
        <UnitCard key={u.id} unit={u} place={place} />
      ))}
    </div>
  );
}
