import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, CheckboxField, FieldGrid, SelectField, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import { enumOptions, pick } from "@/lib/admin/labels";
import type { Area, Compound, Enums, FormAction } from "@/lib/admin/types";

export async function CompoundForm({
  action,
  enums,
  areas,
  locale,
  compound,
}: {
  action: FormAction;
  enums: Enums;
  areas: Area[];
  locale: string;
  compound?: Compound;
}) {
  const t = await getTranslations();
  const s = (key: string) => t(`admin.compounds.${key}`);
  return (
    <EntityForm
      formId="compound-form"
      action={action}
      submitLabel={compound ? t("admin.actions.save") : s("new")}
      cancelHref="/dashboard/compounds"
      sections={[
        { id: "basics", label: s("basics") },
        { id: "description", label: s("descriptionSection") },
        { id: "place", label: s("place") },
        { id: "amenities", label: s("amenitiesSection") },
      ]}
    >
      <Card id="basics" title={s("basics")}>
        <div className="space-y-5">
          <FieldGrid cols={2}>
            <SelectField
              label={s("area")}
              name="area_id"
              required
              options={areas.map((a) => ({ value: a.id, label: pick(locale, a.name_ar, a.name_en) }))}
              defaultValue={compound?.area_id}
            />
            <SelectField
              label={s("beach")}
              name="beach_type"
              required
              options={enumOptions(enums.beach_type, (v) => t(`enums.beach_type.${v}`))}
              defaultValue={compound?.beach_type}
            />
          </FieldGrid>
          <BilingualField label={s("name")} name="name" ar={compound?.name_ar} en={compound?.name_en} required />
          <SlugField entity="compounds" sourceName="name_en" currentId={compound?.id} defaultValue={compound?.slug} />
          <CheckboxField label={s("featured")} name="is_featured" defaultChecked={compound?.is_featured} />
        </div>
      </Card>
      <Card id="description" title={s("descriptionSection")}>
        <BilingualField label={s("description")} name="description" ar={compound?.description_ar} en={compound?.description_en} required multiline />
      </Card>
      <Card id="place" title={s("place")}>
        <FieldGrid cols={3}>
          <TextField label={s("lat")} name="lat" type="number" step="0.000001" min={-90} max={90} dir="ltr" defaultValue={compound?.lat} />
          <TextField label={s("lng")} name="lng" type="number" step="0.000001" min={-180} max={180} dir="ltr" defaultValue={compound?.lng} />
          <TextField label={s("cover")} name="cover_image_url" type="url" dir="ltr" defaultValue={compound?.cover_image_url} />
        </FieldGrid>
      </Card>
      <Card id="amenities" title={s("amenitiesSection")}>
        <div className="space-y-5">
          <TextField label={s("amenities")} hint={s("amenitiesHint")} name="amenities" defaultValue={compound?.amenities.join("، ")} />
          <BilingualField label={s("gate")} name="gate_info" ar={compound?.gate_info_ar} en={compound?.gate_info_en} multiline />
        </div>
      </Card>
    </EntityForm>
  );
}
