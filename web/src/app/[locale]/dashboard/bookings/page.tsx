import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { StateBadge } from "@/components/ds/state-badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { adminGet } from "@/lib/admin/api";
import { param, type SearchParams } from "@/lib/admin/filter";
import { bookingStatusTone, pick } from "@/lib/admin/labels";
import type { BookingRow, UnitRow } from "@/lib/admin/types";
import { formatPhone } from "@/lib/public/phone";
import { formatEGP } from "@/lib/utils";

const STATUSES = ["confirmed", "cancelled", "completed"] as const;

export default async function BookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const q = param(sp, "q");
  const status = param(sp, "status");
  const unit = param(sp, "unit");
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (status) query.set("status", status);
  if (unit) query.set("unit", unit);
  const [t, statusLabel, rows, all, units] = await Promise.all([
    getTranslations("admin.bookings"),
    getTranslations("public.bookingStatus"),
    adminGet<BookingRow[]>(`/bookings${query.size ? `?${query}` : ""}`),
    q || status || unit ? adminGet<BookingRow[]>("/bookings") : null,
    adminGet<UnitRow[]>("/units"),
  ]);
  const total = (all ?? rows).length;
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d));

  return (
    <>
      <PageHeader title={t("heading")} subtitle={<ListCount total={total} shown={rows.length} filtered={!!(q || status || unit)} />} />
      <FilterBar
        placeholder={t("search")}
        selects={[
          { name: "status", label: t("status"), options: STATUSES.map((s) => ({ value: s, label: statusLabel(s) })) },
          { name: "unit", label: t("unit"), options: units.map((u) => ({ value: u.id, label: pick(locale, u.title_ar, u.title_en) })) },
        ]}
      />
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{total === 0 ? t("empty") : t("noResults")}</EmptyState>
        ) : (
          <DataTable head={[t("ref"), t("guest"), t("unit"), t("dates"), t("total"), t("status")]}>
            {rows.map((b) => (
              <tr key={b.id} className={rowCls}>
                <td className={`${cellCls} num`} data-cell="primary">
                  <RowLink href={`/dashboard/bookings/${b.id}`} primary={b.ref} />
                </td>
                <td className={cellCls} data-label={t("guest")}>
                  {b.customer_name}
                  <span className="num block text-sm text-ink-muted" dir="ltr">
                    {formatPhone(b.customer_phone)}
                  </span>
                </td>
                <td className={cellCls} data-label={t("unit")}>{pick(locale, b.unit_title_ar, b.unit_title_en)}</td>
                <td className={`${cellCls} num`} data-label={t("dates")}>
                  {fmt(b.check_in)} – {fmt(b.check_out)}
                  <span className="block text-sm text-ink-muted">{t("nights", { count: b.nights })}</span>
                </td>
                <td className={`${cellCls} num`} data-label={t("total")}>{formatEGP(b.total, locale)}</td>
                <td className={cellCls} data-cell="action">
                  <StateBadge tone={bookingStatusTone(b.status)}>{statusLabel(b.status as "confirmed")}</StateBadge>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
