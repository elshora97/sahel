import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { Area, Enums } from "@/lib/admin/types";
import { createCompound } from "../actions";
import { CompoundForm } from "../compound-form";

export default async function NewCompoundPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, enums, areas] = await Promise.all([getTranslations("admin"), adminGet<Enums>("/enums"), adminGet<Area[]>("/areas")]);
  return (
    <>
      <PageHeader title={t("compounds.new")} back={{ href: "/dashboard/compounds", label: t("actions.backToList") }} />
      <CompoundForm action={createCompound.bind(null, locale)} enums={enums} areas={areas} locale={locale} />
    </>
  );
}
