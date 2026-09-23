import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { EntityForm } from "@/components/admin/entity-form";
import { BilingualField, FieldGrid, SelectField, TextField } from "@/components/admin/fields";
import { SlugField } from "@/components/admin/slug-field";
import { enumOptions } from "@/lib/admin/labels";
import type { Area, Enums, FormAction } from "@/lib/admin/types";

export async function AreaForm({ action, enums, area }: { action: FormAction; enums: Enums; area?: Area }) {
  const t = await getTranslations();
  return (
    <EntityForm
      formId="area-form"
      action={action}
      submitLabel={area ? t("admin.actions.save") : t("admin.areas.new")}
      cancelHref="/dashboard/areas"
    >
      <Card title={t("admin.areas.basics")}>
        <div className="space-y-5">
          <BilingualField label={t("admin.areas.name")} name="name" ar={area?.name_ar} en={area?.name_en} required />
          <SlugField entity="areas" sourceName="name_en" currentId={area?.id} defaultValue={area?.slug} />
          <FieldGrid cols={3}>
            <SelectField
              label={t("admin.areas.region")}
              name="region"
              required
              options={enumOptions(enums.region, (v) => t(`enums.region.${v}`))}
              defaultValue={area?.region}
            />
            <TextField label={t("admin.areas.km")} hint={t("admin.areas.kmHint")} name="km_marker" type="number" min={0} defaultValue={area?.km_marker} />
            <TextField label={t("admin.areas.order")} hint={t("admin.areas.orderHint")} name="sort_order" type="number" defaultValue={area?.sort_order ?? 0} />
          </FieldGrid>
        </div>
      </Card>
    </EntityForm>
  );
}
