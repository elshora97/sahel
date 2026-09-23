/* eslint-disable @next/next/no-img-element -- admin photos straight from MinIO */
import { getTranslations } from "next-intl/server";

import { deleteUnit } from "@/app/[locale]/dashboard/units/actions";
import { StateBadge } from "@/components/ds/state-badge";
import { pick, unitStatusTone } from "@/lib/admin/labels";
import type { UnitRow } from "@/lib/admin/types";
import { GuardedLink } from "./guarded-link";
import { RowDelete } from "./row-delete";

/**
 * Units as the design system's UnitCard (`bs-unit`): photo with the status
 * as its flag, place, title, metadata. The title link covers the card, so
 * the whole card opens the unit; Delete sits above it.
 */
export async function UnitsGrid({ rows, locale, back }: { rows: UnitRow[]; locale: string; back: string }) {
  const t = await getTranslations();
  return (
    <ul className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
      {rows.map((u) => {
        const title = pick(locale, u.title_ar, u.title_en);
        return (
          <li key={u.id} className="bs-unit relative rounded-lg focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-sea">
            <div className={`bs-unit__photo aspect-[4/3] ${u.cover_url ? "" : "bs-unit__photo--empty"}`}>
              {u.cover_url && <img src={u.cover_url} alt="" />}
              <span className="bs-unit__flag">
                <StateBadge tone={unitStatusTone(u.status)}>{t(`enums.unit_status.${u.status}`)}</StateBadge>
              </span>
            </div>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="bs-unit__place">
                  {pick(locale, u.compound_name_ar, u.compound_name_en)} · {t(`enums.type.${u.type}`)}
                </p>
                <h3 className="bs-unit__title">
                  <GuardedLink
                    href={`/dashboard/units/${u.id}`}
                    className="text-ink outline-none after:absolute after:inset-0 after:content-[''] hover:text-sea-deep"
                  >
                    {title}
                  </GuardedLink>
                </h3>
                <p className="bs-unit__meta num">
                  {t("admin.units.cardMeta", { bedrooms: u.bedrooms, guests: u.max_guests, sea: u.sea_distance_m })}
                </p>
              </div>
              <RowDelete action={deleteUnit.bind(null, u.id, locale, title, back)} name={title} detail={t("admin.confirm.unit")} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
