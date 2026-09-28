import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { pageWindow } from "@/lib/public/urls";

/** Previous / next links; `href(page)` builds each target. Hidden when one page. */
export async function Pagination({
  page,
  size,
  total,
  href,
}: {
  page: number;
  size: number;
  total: number;
  href: (page: number) => string;
}) {
  const t = await getTranslations("public.pagination");
  const { pages, prev, next } = pageWindow(page, size, total);
  if (pages <= 1) return null;
  const link = (target: number | null, label: string) =>
    target ? (
      <a href={href(target)} className={buttonClass("secondary")}>
        {label}
      </a>
    ) : (
      <span className={buttonClass("secondary")} aria-disabled="true">
        {label}
      </span>
    );
  return (
    <nav className="pb-pages" aria-label={t("label")}>
      {link(prev, t("prev"))}
      <span className="num">{t("status", { page, pages })}</span>
      {link(next, t("next"))}
    </nav>
  );
}
