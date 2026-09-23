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
import { other, pick } from "@/lib/admin/labels";
import type { Area } from "@/lib/admin/types";
import { deleteArea } from "./actions";

export default async function AreasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const [t, all] = await Promise.all([getTranslations(), adminGet<Area[]>("/areas")]);
  const q = param(sp, "q");
  const back = listQuery(sp);
  const rows = filterByQuery(all, q, (a) => [a.name_ar, a.name_en, a.slug]);

  return (
    <>
      <PageHeader
        title={t("admin.areas.heading")}
        subtitle={<ListCount total={all.length} shown={rows.length} filtered={q !== ""} />}
        actions={
          <GuardedLink href="/dashboard/areas/new" className={buttonClass("primary")}>
            {t("admin.areas.new")}
          </GuardedLink>
        }
      />
      <FilterBar placeholder={t("admin.areas.search")} />
      <ListErrors>
        <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{all.length === 0 ? t("admin.areas.empty") : t("admin.list.noResults")}</EmptyState>
        ) : (
          <DataTable head={[t("admin.areas.name"), t("admin.areas.region"), t("admin.areas.km"), t("admin.areas.order"), <span key="actions" className="sr-only">{t("admin.list.actions")}</span>]}>
            {rows.map((a) => (
              <tr key={a.id} className={rowCls}>
                <td className={cellCls}>
                  <RowLink href={`/dashboard/areas/${a.id}`} primary={pick(locale, a.name_ar, a.name_en)} secondary={other(locale, a.name_ar, a.name_en)} />
                </td>
                <td className={cellCls}>{t(`enums.region.${a.region}`)}</td>
                <td className={`${cellCls} num`}>{a.km_marker ?? "—"}</td>
                <td className={`${cellCls} num`}>{a.sort_order}</td>
                <td className={`${cellCls} w-px text-end`}>
                  <RowDelete action={deleteArea.bind(null, a.id, locale, pick(locale, a.name_ar, a.name_en), back)} name={pick(locale, a.name_ar, a.name_en)} detail={t("admin.confirm.referenced")} />
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
