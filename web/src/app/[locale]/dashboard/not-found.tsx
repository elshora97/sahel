import { getTranslations } from "next-intl/server";

import { GuardedLink } from "@/components/admin/guarded-link";
import { linkCls } from "@/components/admin/ui";

export default async function DashboardNotFound() {
  const t = await getTranslations("admin.notFound");
  return (
    <div className="space-y-3">
      <h1 className="text-[26px] leading-[34px] font-semibold">{t("heading")}</h1>
      <p className="text-ink-muted">{t("body")}</p>
      <GuardedLink href="/dashboard" className={linkCls}>
        {t("back")}
      </GuardedLink>
    </div>
  );
}
