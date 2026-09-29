import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { StateBadge } from "@/components/ds/state-badge";
import { SignInPrompt } from "@/components/public/sign-in-prompt";
import { Link } from "@/i18n/navigation";
import { bookingStatusTone, pick } from "@/lib/admin/labels";
import { currentGuest, guestFetch } from "@/lib/public/guest";
import type { MyBooking } from "@/lib/public/types";
import { formatEGP } from "@/lib/utils";
import { signOutGuest } from "../guest-actions";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.myBookings" });
  return { title: t("title"), robots: { index: false } };
}

export default async function MyBookingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("public.myBookings");
  const enums = await getTranslations("public.bookingStatus");
  const guest = await currentGuest();

  if (!guest) {
    return (
      <div className="pb-lost">
        <h1>{t("title")}</h1>
        <p>{t("signInBody")}</p>
        <SignInPrompt label={t("signIn")} />
      </div>
    );
  }

  const bookings = (await guestFetch<MyBooking[]>("/me/bookings")).body ?? [];
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d));

  return (
    <div style={{ maxInlineSize: 820, marginInline: "auto" }}>
      <div className="pb-section__head" style={{ marginBlockStart: 32 }}>
        <div>
          <h1 className="pb-title">{t("title")}</h1>
          <p className="pb-sub">{t("hello", { name: guest.name || guest.phone })}</p>
        </div>
        <form action={signOutGuest.bind(null, locale)} className="pb-section__more">
          <button type="submit" className={buttonClass("secondary", "sm")}>
            <LogOut size={16} aria-hidden="true" />
            {t("signOut")}
          </button>
        </form>
      </div>

      {bookings.length === 0 ? (
        <div className="pb-empty">
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyBody")}</p>
          <Link href="/search" className={buttonClass("primary")}>
            {t("browse")}
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {bookings.map((b) => (
            <li key={b.id}>
              <Link href={`/booking/${b.ref}`} className="pb-callout" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                {b.cover_url && <img src={b.cover_url} alt="" width={96} height={72} style={{ borderRadius: 14, objectFit: "cover", inlineSize: 96, blockSize: 72, flex: "none" }} />}
                <span style={{ flex: 1, minInlineSize: 0 }}>
                  <strong>{pick(locale, b.unit_title_ar, b.unit_title_en)}</strong>
                  <span className="num" style={{ display: "block", color: "var(--ink-muted)", fontSize: 14 }}>
                    {fmt(b.check_in)} – {fmt(b.check_out)} · {formatEGP(b.total, locale)}
                  </span>
                  <span className="num" dir="ltr" style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                    {b.ref}
                  </span>
                </span>
                <StateBadge tone={bookingStatusTone(b.status)}>{enums(b.status as "confirmed")}</StateBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
