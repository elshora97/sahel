import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import type { CompoundRow, Enums, FormAction, Owner, Unit } from "@/lib/admin/types";

export function UnitForm({
  action,
  enums,
  owners,
  compounds,
  unit,
}: {
  action: FormAction;
  enums: Enums;
  owners: Owner[];
  compounds: CompoundRow[];
  unit?: Unit;
}) {
  return (
    <EntityForm action={action} submitLabel={unit ? "Save changes" : "Create unit"}>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Compound"
          name="compound_id"
          required
          options={compounds.map((c) => ({ value: c.id, label: `${c.name_en} · ${c.area_name_en}` }))}
          defaultValue={unit?.compound_id}
        />
        <SelectField
          label="Owner"
          name="owner_id"
          required
          options={owners.map((o) => ({ value: o.id, label: o.name }))}
          defaultValue={unit?.owner_id}
        />
        <SelectField
          label="Status"
          name="status"
          required
          options={enums.unit_status}
          defaultValue={unit?.status ?? "draft"}
          hint="Only active units are public."
        />
      </div>

      <BilingualField label="Title" name="title" ar={unit?.title_ar} en={unit?.title_en} required />
      <SlugField entity="units" sourceName="title_en" currentId={unit?.id} defaultValue={unit?.slug} />
      <BilingualField label="Description" name="description" ar={unit?.description_ar} en={unit?.description_en} required multiline />
      <BilingualField label="House rules" name="house_rules" ar={unit?.house_rules_ar} en={unit?.house_rules_en} multiline />

      <div className="grid gap-4 sm:grid-cols-4">
        <SelectField label="Type" name="type" options={enums.type} defaultValue={unit?.type} required />
        <SelectField label="View" name="view" options={enums.view} defaultValue={unit?.view} required />
        <TextField label="Sea distance (m)" name="sea_distance_m" type="number" min={0} required defaultValue={unit?.sea_distance_m} />
        <TextField label="Row" name="row_number" type="number" min={1} defaultValue={unit?.row_number} hint="1 = first row." />
        <TextField label="Bedrooms" name="bedrooms" type="number" min={0} required defaultValue={unit?.bedrooms} />
        <TextField label="Bathrooms" name="bathrooms" type="number" min={0} required defaultValue={unit?.bathrooms} />
        <TextField label="Base guests" name="base_guests" type="number" min={1} required defaultValue={unit?.base_guests} />
        <TextField label="Max guests" name="max_guests" type="number" min={1} required defaultValue={unit?.max_guests} />
        <TextField label="Area (m²)" name="area_sqm" type="number" min={1} defaultValue={unit?.area_sqm} />
        <TextField label="Floor" name="floor" type="number" defaultValue={unit?.floor} />
        <TextField label="Latitude" name="lat" type="number" step="0.000001" min={-90} max={90} defaultValue={unit?.lat} />
        <TextField label="Longitude" name="lng" type="number" step="0.000001" min={-180} max={180} defaultValue={unit?.lng} />
      </div>

      <TextField label="Amenities" name="amenities" defaultValue={unit?.amenities.join(", ")} hint="Comma-separated: wifi, pool, bbq…" />
      <TextArea
        label="Exact address"
        name="exact_address"
        rows={2}
        defaultValue={unit?.exact_address}
        hint="Admin only. Never shown on the public site."
      />
    </EntityForm>
  );
}
