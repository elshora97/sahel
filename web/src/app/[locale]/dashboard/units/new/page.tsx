import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { CompoundRow, Enums, Owner } from "@/lib/admin/types";
import { createUnit } from "../actions";
import { UnitForm } from "../unit-form";

export default async function NewUnitPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, enums, owners, compounds] = await Promise.all([
    getTranslations("admin"),
    adminGet<Enums>("/enums"),
    adminGet<Owner[]>("/owners"),
    adminGet<CompoundRow[]>("/compounds"),
  ]);
  return (
    <>
      <PageHeader title={t("units.new")} subtitle={t("units.newHint")} back={{ href: "/dashboard/units", label: t("actions.backToList") }} />
      <UnitForm action={createUnit.bind(null, locale)} enums={enums} owners={owners} compounds={compounds} locale={locale} />
    </>
  );
}
