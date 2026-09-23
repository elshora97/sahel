import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { createOwner } from "../actions";
import { OwnerForm } from "../owner-form";

export default async function NewOwnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("admin");
  return (
    <>
      <PageHeader title={t("owners.new")} back={{ href: "/dashboard/owners", label: t("actions.backToList") }} />
      <OwnerForm action={createOwner.bind(null, locale)} />
    </>
  );
}
