import { DangerZone, DeleteButton } from "@/components/admin/delete-button";
import { ImageManager } from "@/components/admin/image-manager";
import { PageHeader } from "@/components/admin/page-header";
import { linkCls } from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/units-table";
import { adminGet, getOr404 } from "@/lib/admin/api";
import type { CompoundRow, Enums, Owner, UnitDetail } from "@/lib/admin/types";
import { deleteUnit, updateUnit } from "../actions";
import { UnitForm } from "../unit-form";

export default async function EditUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [unit, enums, owners, compounds] = await Promise.all([
    getOr404<UnitDetail>(`/units/${id}`),
    adminGet<Enums>("/enums"),
    adminGet<Owner[]>("/owners"),
    adminGet<CompoundRow[]>("/compounds"),
  ]);
  return (
    <>
      <PageHeader title={unit.title_en} back="/dashboard/units" />
      <div className="mb-6 flex items-center gap-3 text-sm">
        <StatusBadge status={unit.status} />
        {unit.status === "active" && (
          <a href={`/ar/unit/${unit.slug}`} className={linkCls} target="_blank" rel="noreferrer">
            View public page ↗
          </a>
        )}
      </div>
      <div className="space-y-12">
        <UnitForm action={updateUnit.bind(null, id)} enums={enums} owners={owners} compounds={compounds} unit={unit} />
        <ImageManager unitId={id} images={unit.images} />
      </div>
      <DangerZone>
        <DeleteButton action={deleteUnit.bind(null, id)} what="unit" />
      </DangerZone>
    </>
  );
}
