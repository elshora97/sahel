import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { GuardedLink } from "@/components/admin/guarded-link";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { adminGet } from "@/lib/admin/api";
import { filterByQuery, param, type SearchParams } from "@/lib/admin/filter";
import type { Owner } from "@/lib/admin/types";

export default async function OwnersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [t, all] = await Promise.all([getTranslations("admin"), adminGet<Owner[]>("/owners")]);
  const q = param(sp, "q");
  const rows = filterByQuery(all, q, (o) => [o.name, o.phone, o.email]);

  return (
    <>
      <PageHeader
        title={t("owners.heading")}
        subtitle={<ListCount total={all.length} shown={rows.length} filtered={q !== ""} />}
        actions={
          <GuardedLink href="/dashboard/owners/new" className={buttonClass("primary")}>
            {t("owners.new")}
          </GuardedLink>
        }
      />
      <FilterBar placeholder={t("owners.search")} />
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{all.length === 0 ? t("owners.empty") : t("list.noResults")}</EmptyState>
        ) : (
          <DataTable head={[t("owners.name"), t("owners.phone"), t("owners.email"), t("owners.commission")]}>
            {rows.map((o) => (
              <tr key={o.id} className={rowCls}>
                <td className={cellCls}>
                  <RowLink href={`/dashboard/owners/${o.id}`} primary={o.name} />
                </td>
                <td className={`${cellCls} num`} dir="ltr">
                  {o.phone}
                </td>
                <td className={cellCls} dir="ltr">
                  {o.email ?? "—"}
                </td>
                <td className={`${cellCls} num`}>{o.commission_pct}%</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
