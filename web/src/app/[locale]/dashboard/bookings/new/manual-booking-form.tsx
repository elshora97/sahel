"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { ErrorBanner } from "@/components/admin/entity-form";
import { StayPicker } from "@/components/admin/stay-picker";
import { hintCls, inputCls, labelCls } from "@/components/admin/ui";
import { useRouter } from "@/i18n/navigation";
import { startNavProgress } from "@/components/ds/nav-progress";
import { pick } from "@/lib/admin/labels";
import { canPick, nextTaken, type Taken } from "@/lib/admin/stay-picker";
import { nightsBetween } from "@/lib/admin/timeline";
import type { UnitRow } from "@/lib/admin/types";
import { toPiasters } from "@/lib/public/calendar";
import { formatEGP } from "@/lib/utils";
import { createManualBooking, takenNights } from "./actions";

const KNOWN = ["invalid_range", "invalid_phone", "invalid_name", "invalid_guests", "price_required", "unit_required", "dates_taken"] as const;

/** Books a stay for a guest who called or came in; it is confirmed at once. */
export function ManualBookingForm({
  units,
  initial,
  today,
}: {
  units: UnitRow[];
  initial: { unit?: string; checkIn?: string; checkOut?: string };
  today: string;
}) {
  const t = useTranslations("admin.bookings.manual");
  const locale = useLocale();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [unitId, setUnitId] = useState(initial.unit && units.some((u) => u.id === initial.unit) ? initial.unit : "");
  const unit = units.find((u) => u.id === unitId);
  const [range, setRange] = useState<{ checkIn?: string; checkOut?: string }>({ checkIn: initial.checkIn, checkOut: initial.checkOut });
  const checkIn = range.checkIn ?? "";
  const checkOut = range.checkOut ?? "";
  const [taken, setTaken] = useState<Taken>([]);
  const [loadingTaken, setLoadingTaken] = useState(false);

  // Load the unit's closed nights, and drop a selection they rule out.
  useEffect(() => {
    if (!unitId) return setTaken([]);
    let live = true;
    setLoadingTaken(true);
    takenNights(unitId, today)
      .then((tk) => {
        if (!live) return;
        setTaken(tk);
        setRange((r) => {
          if (!r.checkIn) return r;
          if (r.checkIn < today || !canPick(r.checkIn, undefined, undefined, tk)) return {};
          const limit = nextTaken(r.checkIn, tk);
          return r.checkOut && limit && r.checkOut > limit ? { checkIn: r.checkIn } : r;
        });
      })
      .catch(() => live && setTaken([]))
      .finally(() => live && setLoadingTaken(false));
    return () => {
      live = false;
    };
  }, [unitId, today]);
  const [guests, setGuests] = useState("2");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState(unit?.nightly_price ? String(unit.nightly_price / 100) : "");

  const nights = checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;
  const perNight = toPiasters(price);
  const total = nights > 0 && perNight ? perNight * nights : null;

  const chooseUnit = (id: string) => {
    setUnitId(id);
    const u = units.find((x) => x.id === id);
    setPrice(u?.nightly_price ? String(u.nightly_price / 100) : "");
    if (u && Number(guests) > u.max_guests) setGuests(String(u.max_guests));
  };

  const dayText = (d: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!unitId) return setError(t("errors.unit_required"));
    if (!checkIn || !checkOut) return setError(t("errors.dates_required"));
    if (!perNight) return setError(t("errors.price_required"));
    start(async () => {
      const r = await createManualBooking({ unitId, checkIn, checkOut, guests: Number(guests), phone, name, nightlyPrice: perNight });
      if (r.error || !r.id) {
        return setError(t(`errors.${(KNOWN as readonly string[]).includes(r.error ?? "") ? r.error : "error"}` as "errors.error"));
      }
      startNavProgress();
      router.push(`/dashboard/bookings/${r.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {error && <ErrorBanner title={t("failed")} message={error} />}
        <Card title={t("stay")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={labelCls}>{t("unit")}</span>
              <select className={inputCls} value={unitId} onChange={(e) => chooseUnit(e.target.value)} required>
                <option value="">{t("chooseUnit")}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {pick(locale, u.title_ar, u.title_en)} · {pick(locale, u.compound_name_ar, u.compound_name_en)}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <p className={labelCls}>{t("dates")}</p>
              {unitId ? (
                <StayPicker taken={taken} value={range} onChange={setRange} loading={loadingTaken} today={today} />
              ) : (
                <p className="rounded-md border border-dashed border-line-control px-4 py-6 text-center text-sm text-ink-muted">{t("chooseUnitFirst")}</p>
              )}
              <p className="num mt-2 text-sm" aria-live="polite">
                <span className="text-ink-muted">{t("checkIn")}:</span> {checkIn ? dayText(checkIn) : "—"}
                <span className="mx-3 text-line-control">|</span>
                <span className="text-ink-muted">{t("checkOut")}:</span> {checkOut ? dayText(checkOut) : "—"}
              </p>
            </div>
            <label className="block">
              <span className={labelCls}>{t("guests")}</span>
              <input type="number" className={`${inputCls} num`} min={1} max={unit?.max_guests ?? 50} value={guests} onChange={(e) => setGuests(e.target.value)} required />
              {unit && <span className={hintCls}>{t("maxGuests", { count: unit.max_guests })}</span>}
            </label>
            <label className="block">
              <span className={labelCls}>{t("price")}</span>
              <input className={`${inputCls} num`} inputMode="decimal" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} required />
              <span className={hintCls}>{unit?.nightly_price ? t("priceHint", { price: formatEGP(unit.nightly_price, locale) }) : t("priceMissing")}</span>
            </label>
          </div>
        </Card>
        <Card title={t("guest")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>{t("phone")}</span>
              <input type="tel" className={`${inputCls} num`} dir="ltr" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010 1234 5678" required />
              <span className={hintCls}>{t("phoneHint")}</span>
            </label>
            <label className="block">
              <span className={labelCls}>{t("name")}</span>
              <input className={inputCls} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
            </label>
          </div>
        </Card>
      </div>

      <Card title={t("summary")} className="self-start lg:sticky lg:top-6">
        <dl className="m-0 space-y-2 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t("nights")}</dt>
            <dd className="num m-0 font-medium">{nights || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t("perNight")}</dt>
            <dd className="num m-0 font-medium">{perNight ? formatEGP(perNight, locale) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-2 text-lg">
            <dt>{t("total")}</dt>
            <dd className="num m-0 font-semibold">{total ? formatEGP(total, locale) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-muted">{t("confirmedNote")}</p>
        <Button type="submit" variant="primary" block className="mt-4" disabled={busy}>
          {busy ? t("saving") : t("submit")}
        </Button>
      </Card>
    </form>
  );
}
