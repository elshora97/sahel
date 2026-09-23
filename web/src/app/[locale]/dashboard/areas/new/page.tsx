import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { Enums } from "@/lib/admin/types";
import { createArea } from "../actions";
import { AreaForm } from "../area-form";

export default async function NewAreaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, enums] = await Promise.all([getTranslations("admin"), adminGet<Enums>("/enums")]);
  return (
    <>
      <PageHeader title={t("areas.new")} back={{ href: "/dashboard/areas", label: t("actions.backToList") }} />
      <AreaForm action={createArea.bind(null, locale)} enums={enums} />
    </>
  );
}
