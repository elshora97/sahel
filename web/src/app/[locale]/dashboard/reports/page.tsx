import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { StatTile } from "@/components/ds/stat-tile";
import { BarChart } from "@/components/admin/bar-chart";
import { GuardedLink } from "@/components/admin/guarded-link";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { adminGet } from "@/lib/admin/api";
import { niceScale } from "@/lib/admin/chart";
import { param, type SearchParams } from "@/lib/admin/filter";
import { pick } from "@/lib/admin/labels";
import type { Report } from "@/lib/admin/types";
import { formatEGP } from "@/lib/utils";

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const asked = Number(param(sp, "year"));
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : undefined;
  const [t, r] = await Promise.all([getTranslations("admin.reports"), adminGet<Report>(`/reports${year ? `?year=${year}` : ""}`)]);

  const intl = locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  const monthName = (m: string, style: "short" | "long") =>
    new Intl.DateTimeFormat(intl, { month: style, timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  const money = (p: number) => formatEGP(p, locale);
  // Chart ticks read as whole pounds, without the currency, to stay short.
  const compact = new Intl.NumberFormat(intl, { notation: "compact", maximumFractionDigits: 1 });
  const thisMonth = r.today.slice(0, 7);

  const sum = (k: "nights" | "revenue" | "collected" | "available_nights" | "bookings_made") => r.months.reduce((n, m) => n + m[k], 0);
  const revenue = sum("revenue");
  const nights = sum("nights");
  const occupancy = pct(nights, sum("available_nights"));

  const revScale = niceScale(Math.max(...r.months.map((m) => m.revenue / 100)));
  const occScale = { max: 100, steps: [25, 50, 75, 100] };

  return (
    <>
      <PageHeader
        title={t("heading")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <GuardedLink href={{ pathname: "/dashboard/reports", query: { year: r.year - 1 } }} className={buttonClass("secondary", "sm")} aria-label={t("prevYear")}>
              <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span>
            </GuardedLink>
            <span className="num min-w-14 text-center text-lg font-semibold">{r.year}</span>
            <GuardedLink href={{ pathname: "/dashboard/reports", query: { year: r.year + 1 } }} className={buttonClass("secondary", "sm")} aria-label={t("nextYear")}>
              <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>
            </GuardedLink>
          </div>
        }
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile compact label={t("revenue")} value={money(revenue)} note={t("revenueNote")} />
          <StatTile compact label={t("collected")} value={money(sum("collected"))} note={t("collectedNote")} />
          <StatTile compact label={t("occupancy")} value={`${occupancy}%`} note={t("nightsNote", { nights })} />
          <StatTile compact label={t("avgRate")} value={nights > 0 ? money(Math.round(revenue / nights)) : "—"} note={t("avgRateNote")} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
          <Card title={t("revenueByMonth")}>
            <BarChart
              label={t("revenueByMonth")}
              max={revScale.max}
              ticks={revScale.steps.map((v) => ({ value: v, display: compact.format(v) }))}
              bars={r.months.map((m) => ({
                key: m.month,
                label: monthName(m.month, "short"),
                value: m.revenue / 100,
                display: money(m.revenue),
                current: m.month === thisMonth,
              }))}
            />
          </Card>
          <Card title={t("occupancyByMonth")}>
            <BarChart
              label={t("occupancyByMonth")}
              max={occScale.max}
              ticks={occScale.steps.map((v) => ({ value: v, display: `${v}%` }))}
              bars={r.months.map((m) => ({
                key: m.month,
                label: monthName(m.month, "short"),
                value: pct(m.nights, m.available_nights),
                display: `${pct(m.nights, m.available_nights)}% · ${t("nightsShort", { nights: m.nights })}`,
                current: m.month === thisMonth,
              }))}
            />
          </Card>
        </div>

        <Card title={t("byMonth")} padded={false}>
          <DataTable head={[t("month"), t("revenue"), t("collected"), t("nights"), t("occupancy"), t("bookingsMade")]}>
            {r.months.map((m) => (
              <tr key={m.month} className={rowCls}>
                <td className={`${cellCls} font-medium`} data-cell="primary">
                  {monthName(m.month, "long")}
                </td>
                <td className={`${cellCls} num`} data-label={t("revenue")}>
                  {money(m.revenue)}
                </td>
                <td className={`${cellCls} num`} data-label={t("collected")}>
                  {money(m.collected)}
                </td>
                <td className={`${cellCls} num`} data-label={t("nights")}>
                  {m.nights}
                </td>
                <td className={`${cellCls} num`} data-label={t("occupancy")}>
                  {pct(m.nights, m.available_nights)}%
                </td>
                <td className={`${cellCls} num`} data-label={t("bookingsMade")}>
                  {m.bookings_made}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>

        <Card title={t("byUnit")} padded={false}>
          {r.units.length === 0 ? (
            <EmptyState>{t("noUnits")}</EmptyState>
          ) : (
            <DataTable head={[t("unit"), t("revenue"), t("nights"), t("occupancy"), t("avgRate"), t("blocked")]}>
              {r.units.map((u) => (
                <tr key={u.id} className={rowCls}>
                  <td className={cellCls} data-cell="primary">
                    <RowLink href={`/dashboard/units/${u.id}`} primary={pick(locale, u.title_ar, u.title_en)} />
                  </td>
                  <td className={`${cellCls} num`} data-label={t("revenue")}>
                    {money(u.revenue)}
                  </td>
                  <td className={`${cellCls} num`} data-label={t("nights")}>
                    {u.nights}
                  </td>
                  <td className={`${cellCls} num`} data-label={t("occupancy")}>
                    {pct(u.nights, u.available_nights)}%
                  </td>
                  <td className={`${cellCls} num`} data-label={t("avgRate")}>
                    {u.nights > 0 ? money(Math.round(u.revenue / u.nights)) : "—"}
                  </td>
                  <td className={`${cellCls} num`} data-label={t("blocked")}>
                    {u.blocked_nights}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
        <p className="text-sm text-ink-muted">{t("footnote", { units: r.active_units })}</p>
      </div>
    </>
  );
}
