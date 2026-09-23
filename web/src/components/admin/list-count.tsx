import { getTranslations } from "next-intl/server";

export async function ListCount({ total, shown, filtered }: { total: number; shown: number; filtered: boolean }) {
  const t = await getTranslations("admin.list");
  return <>{filtered ? t("countFiltered", { count: total, matched: shown }) : t("count", { count: total })}</>;
}
