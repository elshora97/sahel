import { getTranslations } from "next-intl/server";

import { StateBadge } from "@/components/ds/state-badge";
import { HeaderDelete, ListErrors } from "@/components/admin/row-delete";
import { ImageManager } from "@/components/admin/image-manager";
import { PricingPanel } from "@/components/admin/pricing-panel";
import { PageHeader } from "@/components/admin/page-header";
import { linkCls } from "@/components/admin/ui";
import { adminGet, getOr404 } from "@/lib/admin/api";
import { pick, unitStatusTone } from "@/lib/admin/labels";
import type { CalendarRow, CompoundRow, Enums, Owner, Season, UnitDetail, UnitRow } from "@/lib/admin/types";
import { addDays, addMonths } from "@/lib/public/calendar";
import { deleteUnit, updateUnit } from "../actions";
import { UnitForm } from "../unit-form";

export default async function EditUnitPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  const after = addMonths(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1);
  const monthEnd = addDays(`${after.year}-${String(after.month).padStart(2, "0")}-01`, -1);
  const [t, unit, enums, owners, compounds, seasons, calendar, allUnits] = await Promise.all([
    getTranslations(),
    getOr404<UnitDetail>(`/units/${id}`),
    adminGet<Enums>("/enums"),
    adminGet<Owner[]>("/owners"),
    adminGet<CompoundRow[]>("/compounds"),
    adminGet<Season[]>(`/units/${id}/seasons`),
    adminGet<CalendarRow[]>(`/units/${id}/calendar?from=${today.slice(0, 7)}-01&to=${monthEnd}`),
    adminGet<UnitRow[]>("/units"),
  ]);
  const name = pick(locale, unit.title_ar, unit.title_en);

  return (
    <ListErrors>
      <PageHeader
        title={name}
        back={{ href: "/dashboard/units", label: t("admin.actions.backToList") }}
        badge={<StateBadge tone={unitStatusTone(unit.status)}>{t(`enums.unit_status.${unit.status}`)}</StateBadge>}
        subtitle={
          unit.status === "active" ? (
            <a href={`/${locale}/unit/${unit.slug}`} target="_blank" rel="noreferrer" className={`${linkCls} text-sm`}>
              {t("admin.actions.viewPublic")}
            </a>
          ) : undefined
        }
        actions={<HeaderDelete action={deleteUnit.bind(null, id, locale, name, "")} name={name} detail={t("admin.confirm.unit")} />}
      />
      <div className="space-y-6">
        <UnitForm
          key={unit.updated_at}
          action={updateUnit.bind(null, id, locale)}
          enums={enums}
          owners={owners}
          compounds={compounds}
          locale={locale}
          unit={unit}
          images={<ImageManager unitId={id} images={unit.images} />}
        />
        <PricingPanel
          unitId={id}
          seasons={seasons}
          calendar={calendar}
          today={today}
          otherUnits={allUnits.filter((u) => u.id !== id).map((u) => ({ id: u.id, name: pick(locale, u.title_ar, u.title_en) }))}
        />
      </div>
    </ListErrors>
  );
}
