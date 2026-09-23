import { DangerZone, DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { getOr404 } from "@/lib/admin/api";
import type { Owner } from "@/lib/admin/types";
import { deleteOwner, updateOwner } from "../actions";
import { OwnerForm } from "../owner-form";

export default async function EditOwnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await getOr404<Owner>(`/owners/${id}`);
  return (
    <>
      <PageHeader title={owner.name} back="/dashboard/owners" />
      <OwnerForm action={updateOwner.bind(null, id)} owner={owner} />
      <DangerZone>
        <DeleteButton action={deleteOwner.bind(null, id)} what="owner" />
      </DangerZone>
    </>
  );
}
