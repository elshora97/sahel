import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import type { InstapayAccount } from "@/lib/admin/types";
import { InstapayForm } from "./instapay-form";

export default async function SettingsPage() {
  const [t, account] = await Promise.all([getTranslations("admin.settings"), adminGet<InstapayAccount>("/settings/instapay")]);
  return (
    <>
      <PageHeader title={t("heading")} />
      <InstapayForm account={account} />
    </>
  );
}
