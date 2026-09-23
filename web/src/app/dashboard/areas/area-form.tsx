import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, SelectField, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import type { Area, Enums, FormAction } from "@/lib/admin/types";

export function AreaForm({ action, enums, area }: { action: FormAction; enums: Enums; area?: Area }) {
  return (
    <EntityForm action={action} submitLabel={area ? "Save changes" : "Create area"}>
      <BilingualField label="Name" name="name" ar={area?.name_ar} en={area?.name_en} required />
      <SlugField entity="areas" sourceName="name_en" currentId={area?.id} defaultValue={area?.slug} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Region" name="region" options={enums.region} defaultValue={area?.region} required />
        <TextField label="Km marker" name="km_marker" type="number" min={0} defaultValue={area?.km_marker} hint="Km on the coastal road." />
        <TextField label="Sort order" name="sort_order" type="number" defaultValue={area?.sort_order ?? 0} hint="Lower shows first." />
      </div>
    </EntityForm>
  );
}
