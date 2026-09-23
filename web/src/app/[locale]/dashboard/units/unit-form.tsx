import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, FieldGrid, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import { enumOptions, pick } from "@/lib/admin/labels";
import type { CompoundRow, Enums, FormAction, Owner, Unit } from "@/lib/admin/types";

export async function UnitForm({
  action,
  enums,
  owners,
  compounds,
  locale,
  unit,
}: {
  action: FormAction;
  enums: Enums;
  owners: Owner[];
  compounds: CompoundRow[];
  locale: string;
  unit?: Unit;
}) {
  const t = await getTranslations();
  const s = (key: string) => t(`admin.units.${key}`);
  const sections = [
    { id: "basics", label: s("sectionBasics") },
    { id: "text", label: s("sectionText") },
    { id: "rooms", label: s("sectionRooms") },
    { id: "location", label: s("sectionLocation") },
    { id: "amenities", label: s("sectionAmenities") },
    { id: "private", label: s("sectionPrivate") },
    ...(unit ? [{ id: "images", label: s("sectionImages") }] : []),
  ];

  return (
    <EntityForm
      formId="unit-form"
      action={action}
      submitLabel={unit ? t("admin.actions.save") : s("new")}
      cancelHref="/dashboard/units"
      sections={sections}
    >
      <Card id="basics" title={s("sectionBasics")}>
        <FieldGrid cols={2}>
          <SelectField
            label={s("compound")}
            name="compound_id"
            required
            options={compounds.map((c) => ({
              value: c.id,
              label: `${pick(locale, c.name_ar, c.name_en)} · ${pick(locale, c.area_name_ar, c.area_name_en)}`,
            }))}
            defaultValue={unit?.compound_id}
          />
          <SelectField
            label={s("owner")}
            name="owner_id"
            required
            options={owners.map((o) => ({ value: o.id, label: o.name }))}
            defaultValue={unit?.owner_id}
          />
          <SelectField
            label={s("status")}
            name="status"
            required
            hint={s("statusHint")}
            options={enumOptions(enums.unit_status, (v) => t(`enums.unit_status.${v}`))}
            defaultValue={unit?.status ?? "draft"}
          />
          <SelectField
            label={s("type")}
            name="type"
            required
            options={enumOptions(enums.type, (v) => t(`enums.type.${v}`))}
            defaultValue={unit?.type}
          />
        </FieldGrid>
      </Card>

      <Card id="text" title={s("sectionText")}>
        <div className="space-y-5">
          <BilingualField label={s("title")} name="title" ar={unit?.title_ar} en={unit?.title_en} required />
          <SlugField entity="units" sourceName="title_en" currentId={unit?.id} defaultValue={unit?.slug} />
          <BilingualField label={s("description")} name="description" ar={unit?.description_ar} en={unit?.description_en} required multiline />
        </div>
      </Card>

      <Card id="rooms" title={s("sectionRooms")}>
        <FieldGrid cols={4}>
          <TextField label={s("bedrooms")} name="bedrooms" type="number" min={0} required defaultValue={unit?.bedrooms} />
          <TextField label={s("bathrooms")} name="bathrooms" type="number" min={0} required defaultValue={unit?.bathrooms} />
          <TextField label={s("baseGuests")} name="base_guests" type="number" min={1} required defaultValue={unit?.base_guests} />
          <TextField label={s("maxGuests")} name="max_guests" type="number" min={1} required defaultValue={unit?.max_guests} />
          <TextField label={s("areaSqm")} name="area_sqm" type="number" min={1} defaultValue={unit?.area_sqm} />
        </FieldGrid>
      </Card>

      <Card id="location" title={s("sectionLocation")}>
        <FieldGrid cols={3}>
          <TextField label={s("seaDistance")} name="sea_distance_m" type="number" min={0} required defaultValue={unit?.sea_distance_m} />
          <TextField label={s("row")} hint={s("rowHint")} name="row_number" type="number" min={1} defaultValue={unit?.row_number} />
          <SelectField
            label={s("view")}
            name="view"
            required
            options={enumOptions(enums.view, (v) => t(`enums.view.${v}`))}
            defaultValue={unit?.view}
          />
          <TextField label={s("floor")} name="floor" type="number" defaultValue={unit?.floor} />
          <TextField label={s("lat")} name="lat" type="number" step="0.000001" min={-90} max={90} dir="ltr" defaultValue={unit?.lat} />
          <TextField label={s("lng")} name="lng" type="number" step="0.000001" min={-180} max={180} dir="ltr" defaultValue={unit?.lng} />
        </FieldGrid>
      </Card>

      <Card id="amenities" title={s("sectionAmenities")}>
        <div className="space-y-5">
          <TextField label={s("amenities")} hint={s("amenitiesHint")} name="amenities" defaultValue={unit?.amenities.join("، ")} />
          <BilingualField label={s("houseRules")} name="house_rules" ar={unit?.house_rules_ar} en={unit?.house_rules_en} multiline />
        </div>
      </Card>

      <Card id="private" title={s("sectionPrivate")}>
        <TextArea label={s("exactAddress")} hint={s("exactAddressHint")} name="exact_address" rows={2} defaultValue={unit?.exact_address} />
      </Card>
    </EntityForm>
  );
}
