import { getTranslations } from "next-intl/server";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { PageHeader } from "@/components/admin/page-header";
import { adminGet, getOr404 } from "@/lib/admin/api";
import { pick } from "@/lib/admin/labels";
import type { Area, Compound, Enums } from "@/lib/admin/types";
import { deleteCompound, updateCompound } from "../actions";
import { CompoundForm } from "../compound-form";

export default async function EditCompoundPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [t, compound, enums, areas] = await Promise.all([
    getTranslations("admin"),
    getOr404<Compound>(`/compounds/${id}`),
    adminGet<Enums>("/enums"),
    adminGet<Area[]>("/areas"),
  ]);
  const name = pick(locale, compound.name_ar, compound.name_en);
  return (
    <>
      <PageHeader title={name} back={{ href: "/dashboard/compounds", label: t("actions.backToList") }} />
      <div className="space-y-6">
        <CompoundForm
          key={compound.updated_at}
          action={updateCompound.bind(null, id, locale)}
          enums={enums}
          areas={areas}
          locale={locale}
          compound={compound}
        />
        <ConfirmDelete action={deleteCompound.bind(null, id, locale, name)} name={name} detail={t("confirm.referenced")} />
      </div>
    </>
  );
}
