import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { GuardedLink } from "@/components/admin/guarded-link";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { ListErrors, RowDelete } from "@/components/admin/row-delete";
import { RowLink } from "@/components/admin/row-link";
import { adminGet } from "@/lib/admin/api";
import { filterByQuery, listQuery, param, type SearchParams } from "@/lib/admin/filter";
import type { Owner } from "@/lib/admin/types";
import { deleteOwner } from "./actions";

export default async function OwnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const [t, all] = await Promise.all([getTranslations("admin"), adminGet<Owner[]>("/owners")]);
  const q = param(sp, "q");
  const back = listQuery(sp);
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
      <ListErrors>
        <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{all.length === 0 ? t("owners.empty") : t("list.noResults")}</EmptyState>
        ) : (
          <DataTable head={[t("owners.name"), t("owners.phone"), t("owners.email"), t("owners.commission"), <span key="actions" className="sr-only">{t("list.actions")}</span>]}>
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
                <td className={`${cellCls} w-px text-end`}>
                  <RowDelete action={deleteOwner.bind(null, o.id, locale, o.name, back)} name={o.name} detail={t("confirm.referenced")} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
        </Card>
      </ListErrors>
    </>
  );
}
