import { EntityForm } from "@/components/admin/entity-form";
import { TextArea, TextField } from "@/components/admin/fields";
import type { FormAction, Owner } from "@/lib/admin/types";

export function OwnerForm({ action, owner }: { action: FormAction; owner?: Owner }) {
  return (
    <EntityForm action={action} submitLabel={owner ? "Save changes" : "Create owner"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" required defaultValue={owner?.name} />
        <TextField label="Phone" name="phone" type="tel" dir="ltr" required defaultValue={owner?.phone} />
        <TextField label="Email" name="email" type="email" dir="ltr" defaultValue={owner?.email} />
        <TextField label="National ID" name="national_id" dir="ltr" defaultValue={owner?.national_id} />
        <TextField
          label="Commission %"
          name="commission_pct"
          type="number"
          min={0}
          max={100}
          defaultValue={owner?.commission_pct ?? 0}
        />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={owner?.notes} hint="Internal only." />
    </EntityForm>
  );
}
