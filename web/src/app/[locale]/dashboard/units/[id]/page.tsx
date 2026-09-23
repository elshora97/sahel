import { getTranslations } from "next-intl/server";

import { StateBadge } from "@/components/ds/state-badge";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { ImageManager } from "@/components/admin/image-manager";
import { PageHeader } from "@/components/admin/page-header";
import { linkCls } from "@/components/admin/ui";
import { adminGet, getOr404 } from "@/lib/admin/api";
import { pick, unitStatusTone } from "@/lib/admin/labels";
import type { CompoundRow, Enums, Owner, UnitDetail } from "@/lib/admin/types";
import { deleteUnit, updateUnit } from "../actions";
import { UnitForm } from "../unit-form";

export default async function EditUnitPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [t, unit, enums, owners, compounds] = await Promise.all([
    getTranslations(),
    getOr404<UnitDetail>(`/units/${id}`),
    adminGet<Enums>("/enums"),
    adminGet<Owner[]>("/owners"),
    adminGet<CompoundRow[]>("/compounds"),
  ]);
  const name = pick(locale, unit.title_ar, unit.title_en);

  return (
    <>
      <PageHeader
        title={name}
        back={{ href: "/dashboard/units", label: t("admin.actions.backToList") }}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <StateBadge tone={unitStatusTone(unit.status)}>{t(`enums.unit_status.${unit.status}`)}</StateBadge>
            {unit.status === "active" && (
              <a href={`/${locale}/unit/${unit.slug}`} target="_blank" rel="noreferrer" className={`${linkCls} text-sm`}>
                {t("admin.actions.viewPublic")}
              </a>
            )}
          </span>
        }
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
        <ConfirmDelete action={deleteUnit.bind(null, id, locale, name, "")} name={name} detail={t("admin.confirm.unit")} />
      </div>
    </>
  );
}
