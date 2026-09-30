import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { StateBadge } from "@/components/ds/state-badge";
import { PageHeader } from "@/components/admin/page-header";
import { PaymentActions, RecordPayment } from "@/components/admin/payment-actions";
import { linkCls } from "@/components/admin/ui";
import { getOr404 } from "@/lib/admin/api";
import { bookingStatusTone, formatWhen, pick, type Tone } from "@/lib/admin/labels";
import { formatPhone } from "@/lib/public/phone";
import type { BookingPayment } from "@/lib/admin/types";
import type { BookingView } from "@/lib/public/types";
import { formatEGP } from "@/lib/utils";
import { CancelBooking } from "./cancel-booking";
import { GuestPassword } from "./guest-password";

export default async function BookingPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [t, statusLabel, b] = await Promise.all([
    getTranslations("admin.bookings"),
    getTranslations("public.bookingStatus"),
    getOr404<BookingView & { unit_id: string; payments: BookingPayment[] }>(`/bookings/${id}`),
  ]);
  const tp = await getTranslations("admin.payments");
  const payTone: Record<BookingPayment["status"], Tone> = { pending: "held", verified: "confirmed", rejected: "danger" };
  const payable = ["pending_payment", "awaiting_verification", "confirmed"].includes(b.status);
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "full", timeZone: "UTC" }).format(new Date(d));
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="num m-0 font-medium">{value}</dd>
    </div>
  );
  const cancellable = ["pending_payment", "awaiting_verification", "confirmed"].includes(b.status);

  return (
    <>
      <PageHeader
        title={b.ref}
        back={{ href: "/dashboard/bookings", label: t("backToList") }}
        badge={<StateBadge tone={bookingStatusTone(b.status)}>{statusLabel(b.status as "confirmed")}</StateBadge>}
        subtitle={t("createdAt", { when: formatWhen(b.created_at, locale) })}
        actions={cancellable ? <CancelBooking id={b.id} reference={b.ref} /> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("stay")}>
          <dl className="m-0">
            {row(
              t("unit"),
              <a href={`/${locale}/dashboard/units/${b.unit_id}`} className={linkCls}>
                {pick(locale, b.unit_title_ar, b.unit_title_en)}
              </a>,
            )}
            {row(t("checkIn"), fmt(b.check_in))}
            {row(t("checkOut"), fmt(b.check_out))}
            {row(t("nightsLabel"), b.nights)}
            {row(t("guests"), b.guests)}
          </dl>
        </Card>
        <Card title={t("guestAndMoney")} actions={<GuestPassword customerId={b.customer_id} name={b.customer_name} />}>
          <dl className="m-0">
            {row(t("guest"), b.customer_name)}
            {row(
              t("phone"),
              <a href={`tel:${b.customer_phone}`} className={linkCls} dir="ltr">
                {formatPhone(b.customer_phone)}
              </a>,
            )}
            {row(t("nightlyPrice"), formatEGP(b.nightly_price, locale))}
            {row(t("total"), formatEGP(b.total, locale))}
            {row(t("deposit"), formatEGP(b.deposit_due, locale))}
            {row(tp("paidSoFar"), formatEGP(b.paid_total, locale))}
            {b.status === "pending_payment" && b.hold_expires_at && row(tp("holdUntil"), formatWhen(b.hold_expires_at, locale))}
            {b.cancel_reason && row(t("cancelReason"), b.cancel_reason)}
          </dl>
        </Card>
      </div>

      <Card title={tp("forBooking")} className="mt-6" actions={payable ? <RecordPayment bookingId={b.id} suggested={Math.max(b.deposit_due - b.paid_total, 0) || b.deposit_due} /> : undefined}>
        {b.payments.length === 0 ? (
          <p className="m-0 text-ink-muted">{tp("noneYet")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {b.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line pb-3 last:border-0 last:pb-0">
                <StateBadge tone={payTone[p.status]}>{tp(`status.${p.status}`)}</StateBadge>
                <span className="num font-medium">{formatEGP(p.amount, locale)}</span>
                <span className="text-sm text-ink-muted">
                  {p.recorded_by === "admin" ? tp("byAdmin") : p.sender_name} · {formatWhen(p.created_at, locale)}
                </span>
                {p.has_proof && (
                  <a href={`/${locale}/dashboard/payments/${p.id}/proof`} target="_blank" rel="noreferrer" className={`${linkCls} text-sm`}>
                    {tp("openReceipt")}
                  </a>
                )}
                {p.rejection_reason && <span className="text-sm text-danger">{tp("rejectedBecause", { reason: p.rejection_reason })}</span>}
                {p.notes && <span className="text-sm text-ink-muted">{p.notes}</span>}
                {p.status === "pending" && (
                  <span className="ms-auto">
                    <PaymentActions paymentId={p.id} suggested={Math.max(b.deposit_due - b.paid_total, 0) || p.amount} reference={b.ref} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
