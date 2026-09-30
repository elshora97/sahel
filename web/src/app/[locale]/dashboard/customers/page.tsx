import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { adminGet } from "@/lib/admin/api";
import { param, type SearchParams } from "@/lib/admin/filter";
import type { CustomerRow } from "@/lib/admin/types";
import { formatPhone } from "@/lib/public/phone";
import { formatEGP } from "@/lib/utils";

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const q = param(sp, "q");
  const [t, rows, all] = await Promise.all([
    getTranslations("admin.customers"),
    adminGet<CustomerRow[]>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    q ? adminGet<CustomerRow[]>("/customers") : null,
  ]);
  const total = (all ?? rows).length;
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(d));

  return (
    <>
      <PageHeader title={t("heading")} subtitle={<ListCount total={total} shown={rows.length} filtered={!!q} />} />
      <FilterBar placeholder={t("search")} />
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{total === 0 ? t("empty") : t("noResults")}</EmptyState>
        ) : (
          <DataTable head={[t("name"), t("phone"), t("bookings"), t("paid"), t("lastBooked")]}>
            {rows.map((c) => (
              <tr key={c.id} className={rowCls}>
                <td className={cellCls} data-cell="primary">
                  <RowLink href={`/dashboard/customers/${c.id}`} primary={c.name || "—"} secondary={t("since", { date: fmt(c.created_at) })} />
                </td>
                <td className={`${cellCls} num`} data-label={t("phone")}>
                  <bdi dir="ltr">{formatPhone(c.phone)}</bdi>
                </td>
                <td className={`${cellCls} num`} data-label={t("bookings")}>
                  {c.bookings}
                  {c.stays > 0 && <span className="block text-sm text-ink-muted">{t("stays", { count: c.stays })}</span>}
                </td>
                <td className={`${cellCls} num`} data-label={t("paid")}>
                  {formatEGP(c.paid_total, locale)}
                </td>
                <td className={`${cellCls} num text-ink-muted`} data-label={t("lastBooked")}>
                  {c.last_booked_at ? fmt(c.last_booked_at) : "—"}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
