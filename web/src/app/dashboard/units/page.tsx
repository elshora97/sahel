import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { UnitsTable } from "@/components/admin/units-table";
import { adminGet } from "@/lib/admin/api";
import type { UnitRow } from "@/lib/admin/types";

export default async function UnitsPage() {
  const units = await adminGet<UnitRow[]>("/units");
  return (
    <>
      <PageHeader title="Units" newHref="/dashboard/units/new" />
      {units.length === 0 ? <EmptyState>No units yet. Create a compound and an owner first.</EmptyState> : <UnitsTable rows={units} />}
    </>
  );
}
