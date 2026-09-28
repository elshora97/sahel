import { Sun } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("public");
  return (
    <footer className="pb-footer">
      <div className="pb-wrap">
        <span className="pb-brand">
          <span className="pb-brand__mark" aria-hidden="true">
            <Sun size={20} strokeWidth={2.4} />
          </span>
          {t("brand")}
        </span>
        <p>{t("footer.tagline")}</p>
        <p className="num">{t("footer.rights", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
