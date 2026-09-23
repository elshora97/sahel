import { DangerZone, DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { adminGet, getOr404 } from "@/lib/admin/api";
import type { Area, Enums } from "@/lib/admin/types";
import { deleteArea, updateArea } from "../actions";
import { AreaForm } from "../area-form";

export default async function EditAreaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [area, enums] = await Promise.all([getOr404<Area>(`/areas/${id}`), adminGet<Enums>("/enums")]);
  return (
    <>
      <PageHeader title={area.name_en} back="/dashboard/areas" />
      <AreaForm action={updateArea.bind(null, id)} enums={enums} area={area} />
      <DangerZone>
        <DeleteButton action={deleteArea.bind(null, id)} what="area" />
      </DangerZone>
    </>
  );
}
