import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { Area, Enums } from "@/lib/admin/types";
import { createCompound } from "../actions";
import { CompoundForm } from "../compound-form";

export default async function NewCompoundPage() {
  const [enums, areas] = await Promise.all([adminGet<Enums>("/enums"), adminGet<Area[]>("/areas")]);
  return (
    <>
      <PageHeader title="New compound" back="/dashboard/compounds" />
      <CompoundForm action={createCompound} enums={enums} areas={areas} />
    </>
  );
}
