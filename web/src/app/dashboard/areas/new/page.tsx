import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { Enums } from "@/lib/admin/types";
import { createArea } from "../actions";
import { AreaForm } from "../area-form";

export default async function NewAreaPage() {
  const enums = await adminGet<Enums>("/enums");
  return (
    <>
      <PageHeader title="New area" back="/dashboard/areas" />
      <AreaForm action={createArea} enums={enums} />
    </>
  );
}
