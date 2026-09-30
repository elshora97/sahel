import { getTranslations } from "next-intl/server";

import { adminGet } from "@/lib/admin/api";
import { pounds, toCsv } from "@/lib/admin/csv";
import type { BookingRow } from "@/lib/admin/types";
import { formatPhone } from "@/lib/public/phone";

/** The filters the bookings list passes on; anything else is dropped. */
const PASS = ["q", "status", "unit", "from", "to"];

/**
 * The bookings list, filtered as on screen, as a CSV download. Under
 * /dashboard, so the middleware lets only a signed-in admin reach it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const incoming = new URL(req.url).searchParams;
  const query = new URLSearchParams({ all: "1" });
  for (const k of PASS) {
    const v = incoming.get(k);
    if (v) query.set(k, v);
  }
  const [t, status, rows] = await Promise.all([
    getTranslations({ locale, namespace: "admin.bookings.csv" }),
    getTranslations({ locale, namespace: "public.bookingStatus" }),
    adminGet<BookingRow[]>(`/bookings?${query}`),
  ]);
  const ar = locale === "ar";
  const bookedAt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const csv = toCsv([
    [t("ref"), t("status"), t("guest"), t("phone"), t("compound"), t("unit"), t("checkIn"), t("checkOut"), t("nights"), t("guests"), t("total"), t("deposit"), t("paid"), t("bookedAt")],
    ...rows.map((b) => [
      b.ref,
      status(b.status as "confirmed"),
      b.customer_name,
      formatPhone(b.customer_phone),
      ar ? b.compound_name_ar : b.compound_name_en,
      ar ? b.unit_title_ar : b.unit_title_en,
      b.check_in.slice(0, 10),
      b.check_out.slice(0, 10),
      b.nights,
      b.guests,
      pounds(b.total),
      pounds(b.deposit_due),
      pounds(b.paid_total),
      bookedAt.format(new Date(b.created_at)).replace(",", ""),
    ]),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
