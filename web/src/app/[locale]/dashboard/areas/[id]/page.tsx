import { getTranslations } from "next-intl/server";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { PageHeader } from "@/components/admin/page-header";
import { adminGet, getOr404 } from "@/lib/admin/api";
import { pick } from "@/lib/admin/labels";
import type { Area, Enums } from "@/lib/admin/types";
import { deleteArea, updateArea } from "../actions";
import { AreaForm } from "../area-form";

export default async function EditAreaPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [t, area, enums] = await Promise.all([getTranslations("admin"), getOr404<Area>(`/areas/${id}`), adminGet<Enums>("/enums")]);
  const name = pick(locale, area.name_ar, area.name_en);
  return (
    <>
      <PageHeader title={name} back={{ href: "/dashboard/areas", label: t("actions.backToList") }} />
      <div className="space-y-6">
        <AreaForm key={area.updated_at} action={updateArea.bind(null, id, locale)} enums={enums} area={area} />
        <ConfirmDelete action={deleteArea.bind(null, id, locale, name)} name={name} detail={t("confirm.referenced")} />
      </div>
    </>
  );
}
