import { PageHeader } from "@/components/admin/page-header";
import { createOwner } from "../actions";
import { OwnerForm } from "../owner-form";

export default function NewOwnerPage() {
  return (
    <>
      <PageHeader title="New owner" back="/dashboard/owners" />
      <OwnerForm action={createOwner} />
    </>
  );
}
