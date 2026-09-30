import { getTranslations } from "next-intl/server";

import { BrandMark } from "./brand-mark";

export async function SiteFooter() {
  const t = await getTranslations("public");
  return (
    <footer className="pb-footer">
      <div className="pb-wrap">
        <span className="pb-brand">
          <BrandMark />
          {t("brand")}
        </span>
        <p>{t("footer.tagline")}</p>
        <p className="num">{t("footer.rights", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
