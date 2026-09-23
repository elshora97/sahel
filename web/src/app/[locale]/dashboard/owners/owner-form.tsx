import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { EntityForm } from "@/components/admin/entity-form";
import { FieldGrid, TextArea, TextField } from "@/components/admin/fields";
import type { FormAction, Owner } from "@/lib/admin/types";

export async function OwnerForm({ action, owner }: { action: FormAction; owner?: Owner }) {
  const t = await getTranslations("admin");
  return (
    <EntityForm formId="owner-form" action={action} submitLabel={owner ? t("actions.save") : t("owners.new")} cancelHref="/dashboard/owners">
      <Card title={t("owners.contact")}>
        <FieldGrid cols={2}>
          <TextField label={t("owners.name")} name="name" required defaultValue={owner?.name} />
          <TextField label={t("owners.phone")} name="phone" type="tel" dir="ltr" required defaultValue={owner?.phone} />
          <TextField label={t("owners.email")} name="email" type="email" dir="ltr" defaultValue={owner?.email} />
          <TextField label={t("owners.nationalId")} name="national_id" dir="ltr" defaultValue={owner?.national_id} />
        </FieldGrid>
      </Card>
      <Card title={t("owners.terms")}>
        <div className="space-y-5">
          <div className="max-w-48">
            <TextField label={t("owners.commission")} name="commission_pct" type="number" min={0} max={100} defaultValue={owner?.commission_pct ?? 0} />
          </div>
          <TextArea label={t("owners.notes")} hint={t("owners.notesHint")} name="notes" defaultValue={owner?.notes} />
        </div>
      </Card>
    </EntityForm>
  );
}
