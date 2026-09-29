"use client";

import { Check, Copy, Hourglass, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { buttonClass } from "@/components/ds/button";
import { remaining } from "@/lib/public/countdown";
import type { GuestBooking } from "@/lib/public/types";
import { formatEGP } from "@/lib/utils";
import { uploadReceipt } from "../../guest-actions";

function CopyRow({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="pb-pay__row">
      <span className="pb-pay__label">{label}</span>
      <span className="pb-pay__value num" dir="ltr">
        {value}
      </span>
      <button
        type="button"
        className="pb-pay__copy"
        aria-label={`${copyLabel}: ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

/** How to pay the deposit by InstaPay, a live countdown, and the receipt upload. */
export function PaymentPanel({ booking, locale, last4 }: { booking: GuestBooking; locale: string; last4: string }) {
  const t = useTranslations("public.payment");
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const waiting = booking.status === "awaiting_verification";
  const due = Math.max(booking.deposit_due - booking.paid_total, 0);
  const left = remaining(booking.hold_expires_at, now);
  const lastRejected = [...booking.payments].reverse().find((p) => p.status === "rejected");

  useEffect(() => {
    if (waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  // The server expires the hold within a minute; show that without a reload.
  useEffect(() => {
    if (!waiting && left.over) router.refresh();
  }, [waiting, left.over, router]);

  const submit = (form: FormData) =>
    start(async () => {
      const r = await uploadReceipt(booking.ref, form);
      if (!r.ok) return setError(t.has(`errors.${r.code}`) ? t(`errors.${r.code}` as "errors.error") : t("errors.error"));
      setError(null);
      router.refresh();
    });

  const acct = booking.instapay;
  const configured = acct.address || acct.mobile;

  return (
    <section className="pb-pay" aria-labelledby="pay-title">
      <div className="pb-pay__head">
        <h2 id="pay-title">{waiting ? t("waitingTitle") : t("title")}</h2>
        {!waiting && !left.over && (
          <p className="pb-pay__timer num" role="timer" aria-live="off">
            <Hourglass size={18} aria-hidden="true" />
            {t("heldFor", { hours: left.hours, minutes: String(left.minutes).padStart(2, "0"), seconds: String(left.seconds).padStart(2, "0") })}
          </p>
        )}
      </div>

      {waiting ? (
        <p className="pb-pay__note">{t("waitingBody")}</p>
      ) : (
        <>
          {lastRejected?.rejection_reason && <p className="pb-pay__rejected">{t("rejected", { reason: lastRejected.rejection_reason })}</p>}
          <ol className="pb-pay__steps">
            <li>{t("step1")}</li>
            <li>{t("step2", { ref: booking.ref })}</li>
            <li>{t("step3")}</li>
          </ol>
          {configured ? (
            <div className="pb-pay__card">
              {acct.address && <CopyRow label={t("address")} value={acct.address} copyLabel={t("copy")} />}
              {acct.mobile && <CopyRow label={t("mobile")} value={acct.mobile} copyLabel={t("copy")} />}
              {acct.holder_name && (
                <div className="pb-pay__row">
                  <span className="pb-pay__label">{t("holder")}</span>
                  <span className="pb-pay__value">{acct.holder_name}</span>
                </div>
              )}
              <CopyRow label={t("amount")} value={String(due / 100)} copyLabel={t("copy")} />
              <CopyRow label={t("note")} value={booking.ref} copyLabel={t("copy")} />
            </div>
          ) : (
            <p className="pb-pay__note">{t("notConfigured")}</p>
          )}
          <p className="pb-pay__note num">{t("exactAmount", { amount: formatEGP(due, locale) })}</p>
        </>
      )}

      <form action={submit} className="pb-pay__form">
        <h3>{waiting ? t("anotherReceipt") : t("uploadTitle")}</h3>
        <label className="grid gap-1.5">
          <span className="pb-label">{t("file")}</span>
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="pb-select" style={{ paddingBlock: 10 }} />
          <span className="pb-pay__hint">{t("fileHint")}</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="pb-label">{t("senderName")}</span>
            <input name="sender_name" required maxLength={120} className="pb-select" autoComplete="name" />
          </label>
          <label className="grid gap-1.5">
            <span className="pb-label">{t("senderNumber")}</span>
            <input name="sender_number" maxLength={60} className="pb-select num" dir="ltr" inputMode="tel" />
          </label>
        </div>
        <input type="hidden" name="phone_last4" value={last4} />
        {error && (
          <p role="alert" className="pb-pay__rejected">
            {error}
          </p>
        )}
        <button type="submit" className={buttonClass("primary", "lg", true)} disabled={busy}>
          <Upload size={18} aria-hidden="true" />
          {busy ? t("sending") : t("send")}
        </button>
      </form>
    </section>
  );
}
