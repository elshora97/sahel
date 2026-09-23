import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { CompoundRow, Enums, Owner } from "@/lib/admin/types";
import { createUnit } from "../actions";
import { UnitForm } from "../unit-form";

export default async function NewUnitPage() {
  const [enums, owners, compounds] = await Promise.all([
    adminGet<Enums>("/enums"),
    adminGet<Owner[]>("/owners"),
    adminGet<CompoundRow[]>("/compounds"),
  ]);
  return (
    <>
      <PageHeader title="New unit" back="/dashboard/units" />
      <p className="mb-6 text-sm text-muted-foreground">Save the basics first; images are added on the next screen.</p>
      <UnitForm action={createUnit} enums={enums} owners={owners} compounds={compounds} />
    </>
  );
}
