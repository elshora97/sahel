import { Sailboat } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Link } from "@/i18n/navigation";

export default async function PublicNotFound() {
  const t = await getTranslations("public.notFound");
  return (
    <div className="pb-lost">
      <Sailboat size={64} strokeWidth={1.6} aria-hidden="true" />
      <h1>{t("title")}</h1>
      <p>{t("body")}</p>
      <Link href="/search" className={buttonClass("primary", "lg")}>
        {t("action")}
      </Link>
    </div>
  );
}
