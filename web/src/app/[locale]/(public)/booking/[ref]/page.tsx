import { CalendarCheck2, Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { StateBadge } from "@/components/ds/state-badge";
import { Link } from "@/i18n/navigation";
import { bookingStatusTone, pick } from "@/lib/admin/labels";
import { guestFetch } from "@/lib/public/guest";
import { formatPhone } from "@/lib/public/phone";
import type { GuestBooking } from "@/lib/public/types";
import { formatEGP } from "@/lib/utils";
import { PaymentPanel } from "./payment-panel";

type Props = {
  params: Promise<{ locale: string; ref: string }>;
  searchParams: Promise<{ phone_last4?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ref } = await params;
  return { title: ref.toUpperCase(), robots: { index: false } };
}

const REF = /^BES-[0-9A-HJKMNP-TV-Z]{5}$/;

export default async function BookingPage({ params, searchParams }: Props) {
  const { locale, ref: raw } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("public.booking");
  const enums = await getTranslations("public.bookingStatus");
  const ref = raw.toUpperCase();
  const last4 = ((await searchParams).phone_last4 ?? "").replace(/\D/g, "").slice(0, 4);

  const reply = REF.test(ref)
    ? await guestFetch<GuestBooking>(`/bookings/${ref}`, { query: last4 ? `phone_last4=${last4}` : "" })
    : { status: 404, body: null };
  const b = reply.body;

  if (!b) {
    return (
      <div className="pb-lost" style={{ maxInlineSize: 460, marginInline: "auto" }}>
        <Search size={48} strokeWidth={1.6} aria-hidden="true" />
        <h1>{t("lookupTitle")}</h1>
        <p>{last4 ? t("lookupFailed") : t("lookupBody")}</p>
        <form method="get" className="grid w-full gap-3 text-start">
          <label className="grid gap-1.5">
            <span className="pb-label">{t("reference")}</span>
            <input className="pb-select num" value={ref} readOnly dir="ltr" />
          </label>
          <label className="grid gap-1.5">
            <span className="pb-label">{t("last4")}</span>
            <input className="pb-select num" name="phone_last4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required dir="ltr" defaultValue={last4} />
          </label>
          <button type="submit" className={buttonClass("primary", "lg", true)}>
            {t("show")}
          </button>
        </form>
      </div>
    );
  }

  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "full", timeZone: "UTC" }).format(new Date(d));
  const title = pick(locale, b.unit_title_ar, b.unit_title_en);

  return (
    <article style={{ maxInlineSize: 760, marginInline: "auto" }}>
      <div className="pb-booked">
        <CalendarCheck2 size={40} aria-hidden="true" />
        <div>
          <p className="num" style={{ margin: 0, fontWeight: 600, letterSpacing: "0.04em" }} dir="ltr">
            {b.ref}
          </p>
          <h1 className="pb-title" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>
            {t(`titles.${b.status}` as "titles.confirmed")}
          </h1>
        </div>
        <StateBadge tone={bookingStatusTone(b.status)}>{enums(b.status as "confirmed")}</StateBadge>
      </div>

      {(b.status === "pending_payment" || b.status === "awaiting_verification") && <PaymentPanel booking={b} locale={locale} last4={last4} />}
      {b.status === "expired" && (
        <div className="pb-pay" style={{ marginBlockStart: 24 }}>
          <h2 style={{ margin: 0 }}>{t("expiredTitle")}</h2>
          <p className="pb-pay__note">{t("expiredBody")}</p>
          <Link href={`/unit/${b.unit_slug}`} className={buttonClass("primary")}>
            {t("bookAgain")}
          </Link>
        </div>
      )}

      <div className="pb-aside" style={{ marginBlockStart: 24 }}>
        <Link href={`/unit/${b.unit_slug}`} className="pb-callout" style={{ padding: 0, background: "none" }}>
          {b.cover_url && <img src={b.cover_url} alt="" width={96} height={72} style={{ borderRadius: 14, objectFit: "cover", inlineSize: 96, blockSize: 72 }} />}
          <span>
            <strong>{title}</strong>
            {pick(locale, b.compound_name_ar, b.compound_name_en)}
          </span>
        </Link>
        <dl className="pb-quote__lines num">
          <div>
            <dt>{t("checkIn")}</dt>
            <dd>{fmtDate(b.check_in)}</dd>
          </div>
          <div>
            <dt>{t("checkOut")}</dt>
            <dd>{fmtDate(b.check_out)}</dd>
          </div>
          <div>
            <dt>{t("guests")}</dt>
            <dd>{b.guests}</dd>
          </div>
          <div>
            <dt>{t("guestName")}</dt>
            <dd>
              {b.customer_name} · <span dir="ltr">{formatPhone(b.customer_phone)}</span>
            </dd>
          </div>
          <div>
            <dt>{t("nights", { count: b.nights, price: formatEGP(b.nightly_price, locale) })}</dt>
            <dd>{formatEGP(b.total, locale)}</dd>
          </div>
          <div className="pb-quote__total">
            <dt>{t("total")}</dt>
            <dd>{formatEGP(b.total, locale)}</dd>
          </div>
          <div className="pb-quote__due">
            <dt>{t("deposit")}</dt>
            <dd>{formatEGP(b.deposit_due, locale)}</dd>
          </div>
        </dl>
        {b.paid_total > 0 && (
          <p className="pb-quote__note num">{t("paidSoFar", { amount: formatEGP(b.paid_total, locale) })}</p>
        )}
        {b.status === "cancelled" && <p className="pb-quote__note">{t("cancelledNote")}</p>}
        <p className="pb-quote__note">{t("keepRef", { ref: b.ref })}</p>
      </div>
    </article>
  );
}
