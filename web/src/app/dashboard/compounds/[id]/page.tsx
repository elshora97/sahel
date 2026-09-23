import { DangerZone, DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { adminGet, getOr404 } from "@/lib/admin/api";
import type { Area, Compound, Enums } from "@/lib/admin/types";
import { deleteCompound, updateCompound } from "../actions";
import { CompoundForm } from "../compound-form";

export default async function EditCompoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [compound, enums, areas] = await Promise.all([
    getOr404<Compound>(`/compounds/${id}`),
    adminGet<Enums>("/enums"),
    adminGet<Area[]>("/areas"),
  ]);
  return (
    <>
      <PageHeader title={compound.name_en} back="/dashboard/compounds" />
      <CompoundForm action={updateCompound.bind(null, id)} enums={enums} areas={areas} compound={compound} />
      <DangerZone>
        <DeleteButton action={deleteCompound.bind(null, id)} what="compound" />
      </DangerZone>
    </>
  );
}
