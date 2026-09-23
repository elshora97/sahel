import { getTranslations } from "next-intl/server";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { PageHeader } from "@/components/admin/page-header";
import { getOr404 } from "@/lib/admin/api";
import type { Owner } from "@/lib/admin/types";
import { deleteOwner, updateOwner } from "../actions";
import { OwnerForm } from "../owner-form";

export default async function EditOwnerPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [t, owner] = await Promise.all([getTranslations("admin"), getOr404<Owner>(`/owners/${id}`)]);
  return (
    <>
      <PageHeader title={owner.name} back={{ href: "/dashboard/owners", label: t("actions.backToList") }} />
      <div className="space-y-6">
        <OwnerForm key={owner.updated_at} action={updateOwner.bind(null, id, locale)} owner={owner} />
        <ConfirmDelete action={deleteOwner.bind(null, id, locale, owner.name)} name={owner.name} detail={t("confirm.referenced")} />
      </div>
    </>
  );
}
