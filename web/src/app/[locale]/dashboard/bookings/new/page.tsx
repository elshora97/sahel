import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { adminGet } from "@/lib/admin/api";
import { param, type SearchParams } from "@/lib/admin/filter";
import type { UnitRow } from "@/lib/admin/types";
import { ManualBookingForm } from "./manual-booking-form";

/** ?unit=&in=&out= prefill the form (the timeline links here with a selection). */
export default async function NewBookingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [t, units] = await Promise.all([getTranslations("admin.bookings"), adminGet<UnitRow[]>("/units")]);
  const bookable = units.filter((u) => u.status !== "archived");

  return (
    <>
      <PageHeader title={t("manual.heading")} subtitle={t("manual.subtitle")} back={{ href: "/dashboard/bookings", label: t("backToList") }} />
      <ManualBookingForm
        units={bookable}
        initial={{ unit: param(sp, "unit"), checkIn: param(sp, "in"), checkOut: param(sp, "out") }}
        today={new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date())}
      />
    </>
  );
}
