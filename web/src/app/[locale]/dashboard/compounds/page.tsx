import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { StateBadge } from "@/components/ds/state-badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { GuardedLink } from "@/components/admin/guarded-link";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { adminGet } from "@/lib/admin/api";
import { filterByQuery, param, type SearchParams } from "@/lib/admin/filter";
import { other, pick } from "@/lib/admin/labels";
import type { CompoundRow } from "@/lib/admin/types";

export default async function CompoundsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const [t, all] = await Promise.all([getTranslations(), adminGet<CompoundRow[]>("/compounds")]);
  const q = param(sp, "q");
  const rows = filterByQuery(all, q, (c) => [c.name_ar, c.name_en, c.slug]);

  return (
    <>
      <PageHeader
        title={t("admin.compounds.heading")}
        subtitle={<ListCount total={all.length} shown={rows.length} filtered={q !== ""} />}
        actions={
          <GuardedLink href="/dashboard/compounds/new" className={buttonClass("primary")}>
            {t("admin.compounds.new")}
          </GuardedLink>
        }
      />
      <FilterBar placeholder={t("admin.compounds.search")} />
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{all.length === 0 ? t("admin.compounds.empty") : t("admin.list.noResults")}</EmptyState>
        ) : (
          <DataTable head={[t("admin.compounds.name"), t("admin.compounds.area"), t("admin.compounds.beach"), t("admin.compounds.featuredCol")]}>
            {rows.map((c) => (
              <tr key={c.id} className={rowCls}>
                <td className={cellCls}>
                  <RowLink href={`/dashboard/compounds/${c.id}`} primary={pick(locale, c.name_ar, c.name_en)} secondary={other(locale, c.name_ar, c.name_en)} />
                </td>
                <td className={cellCls}>{pick(locale, c.area_name_ar, c.area_name_en)}</td>
                <td className={cellCls}>{t(`enums.beach_type.${c.beach_type}`)}</td>
                <td className={cellCls}>{c.is_featured && <StateBadge tone="free">{t("admin.compounds.featuredYes")}</StateBadge>}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
