import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, CheckboxField, SelectField, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import type { Area, Compound, Enums, FormAction } from "@/lib/admin/types";

export function CompoundForm({
  action,
  enums,
  areas,
  compound,
}: {
  action: FormAction;
  enums: Enums;
  areas: Area[];
  compound?: Compound;
}) {
  return (
    <EntityForm action={action} submitLabel={compound ? "Save changes" : "Create compound"}>
      <SelectField
        label="Area"
        name="area_id"
        required
        options={areas.map((a) => ({ value: a.id, label: a.name_en }))}
        defaultValue={compound?.area_id}
      />
      <BilingualField label="Name" name="name" ar={compound?.name_ar} en={compound?.name_en} required />
      <SlugField entity="compounds" sourceName="name_en" currentId={compound?.id} defaultValue={compound?.slug} />
      <BilingualField label="Description" name="description" ar={compound?.description_ar} en={compound?.description_en} required multiline />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Beach type" name="beach_type" options={enums.beach_type} defaultValue={compound?.beach_type} required />
        <TextField
          label="Amenities"
          name="amenities"
          defaultValue={compound?.amenities.join(", ")}
          hint="Comma-separated: private beach, lagoons, gates, pools…"
        />
      </div>
      <BilingualField label="Gate info" name="gate_info" ar={compound?.gate_info_ar} en={compound?.gate_info_en} multiline />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Latitude" name="lat" type="number" step="0.000001" min={-90} max={90} defaultValue={compound?.lat} />
        <TextField label="Longitude" name="lng" type="number" step="0.000001" min={-180} max={180} defaultValue={compound?.lng} />
        <TextField label="Cover image URL" name="cover_image_url" type="url" defaultValue={compound?.cover_image_url} />
      </div>
      <CheckboxField label="Featured on the home page" name="is_featured" defaultChecked={compound?.is_featured} />
    </EntityForm>
  );
}
