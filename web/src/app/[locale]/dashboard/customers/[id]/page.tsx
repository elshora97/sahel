import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { DataTable, EmptyState, cellCls, rowCls } from "@/components/ds/data-table";
import { StateBadge } from "@/components/ds/state-badge";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { linkCls } from "@/components/admin/ui";
import { GuestPassword } from "@/app/[locale]/dashboard/bookings/[id]/guest-password";
import { adminGet, getOr404 } from "@/lib/admin/api";
import { bookingStatusTone, pick } from "@/lib/admin/labels";
import type { BookingRow, Customer } from "@/lib/admin/types";
import { formatPhone } from "@/lib/public/phone";
import { formatEGP } from "@/lib/utils";

/** Statuses that count towards what a customer has booked. */
const OCCUPYING = ["pending_payment", "awaiting_verification", "confirmed", "checked_in", "completed"];

export default async function CustomerPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const c = await getOr404<Customer>(`/customers/${encodeURIComponent(id)}`);
  const [t, tb, statusLabel, bookings] = await Promise.all([
    getTranslations("admin.customers"),
    getTranslations("admin.bookings"),
    getTranslations("public.bookingStatus"),
    adminGet<BookingRow[]>(`/bookings?customer=${c.id}`),
  ]);
  const intl = locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  const day = (d: string) => new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d));
  const when = (d: string) => new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(d));
  const value = bookings.filter((b) => OCCUPYING.includes(b.status)).reduce((sum, b) => sum + b.total, 0);

  const row = (label: string, v: React.ReactNode) => (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="num m-0 font-medium">{v}</dd>
    </div>
  );

  return (
    <>
      <PageHeader
        title={c.name || formatPhone(c.phone)}
        subtitle={t("since", { date: when(c.created_at) })}
        back={{ href: "/dashboard/customers", label: t("backToList") }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title={t("details")} actions={<GuestPassword customerId={c.id} name={c.name} />} className="self-start">
          <dl className="m-0">
            {row(t("name"), c.name || "—")}
            {row(
              t("phone"),
              <a href={`tel:${c.phone}`} className={linkCls} dir="ltr">
                {formatPhone(c.phone)}
              </a>,
            )}
            {c.email && row(t("email"), <bdi dir="ltr">{c.email}</bdi>)}
            {row(t("bookings"), bookings.length)}
            {row(t("bookedValue"), formatEGP(value, locale))}
            {row(t("account"), c.has_password ? t("hasPassword") : t("noPassword"))}
          </dl>
        </Card>

        <Card title={t("theirBookings")} padded={false}>
          {bookings.length === 0 ? (
            <EmptyState>{t("noBookings")}</EmptyState>
          ) : (
            <DataTable head={[tb("ref"), tb("unit"), tb("dates"), tb("total"), tb("status")]}>
              {bookings.map((b) => (
                <tr key={b.id} className={rowCls}>
                  <td className={`${cellCls} num`} data-cell="primary">
                    <RowLink href={`/dashboard/bookings/${b.id}`} primary={b.ref} />
                  </td>
                  <td className={cellCls} data-label={tb("unit")}>
                    {pick(locale, b.unit_title_ar, b.unit_title_en)}
                  </td>
                  <td className={`${cellCls} num`} data-label={tb("dates")}>
                    {day(b.check_in)} – {day(b.check_out)}
                    <span className="block text-sm text-ink-muted">{tb("nights", { count: b.nights })}</span>
                  </td>
                  <td className={`${cellCls} num`} data-label={tb("total")}>
                    {formatEGP(b.total, locale)}
                  </td>
                  <td className={cellCls} data-cell="action">
                    <StateBadge tone={bookingStatusTone(b.status)}>{statusLabel(b.status as "confirmed")}</StateBadge>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </>
  );
}
