"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";
import { formatPhone, looksLikeMobile } from "@/lib/public/phone";
import { formatEGP } from "@/lib/utils";
import { bookStay, requestCode, saveName, verifyCode } from "@/app/[locale]/(public)/guest-actions";

export interface StaySummary {
  slug: string;
  title: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  nightlyPrice: number;
  total: number;
  deposit: number;
}

type Step = "phone" | "code" | "name" | "confirm";

const field =
  "min-h-[48px] w-full rounded-md border border-line-control bg-surface px-3 text-[17px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea";

/**
 * Phone sign-in, then (for a booking) the summary and confirmation, in one
 * dialog. `stay` absent means sign-in only; the page refreshes afterwards.
 */
export function GuestFlow({
  open,
  onClose,
  signedIn,
  hasName,
  stay,
}: {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  hasName: boolean;
  stay?: StaySummary;
}) {
  const t = useTranslations("public.guest");
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [shownPhone, setShownPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [busy, start] = useTransition();

  const booking = !!stay;
  // Only when the dialog opens: later prop changes must not reset the step.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setStep(!signedIn ? "phone" : !hasName ? "name" : booking ? "confirm" : "phone");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const fail = (c: string) => setError(t.has(`errors.${c}`) ? t(`errors.${c}` as "errors.error") : t("errors.error"));
  const finish = () => {
    router.refresh(); // the header and page now know the guest is signed in
    if (stay) return setStep("confirm");
    onClose();
  };

  const sendCode = () => {
    if (!looksLikeMobile(phone)) return fail("invalid_phone");
    start(async () => {
      const r = await requestCode(phone);
      if (!r.ok) return fail(r.code);
      setError(null);
      setShownPhone(formatPhone(r.phone));
      setCode("");
      setResendIn(60);
      setStep("code");
    });
  };

  const checkCode = () =>
    start(async () => {
      const r = await verifyCode(phone, code);
      if (!r.ok) return fail(r.code);
      setError(null);
      if (r.needsName) return setStep("name");
      finish();
    });

  const submitName = () =>
    start(async () => {
      const r = await saveName(name);
      if (!r.ok) return fail(r.code);
      setError(null);
      finish();
    });

  const confirm = () =>
    stay &&
    start(async () => {
      const r = await bookStay(stay.slug, stay.checkIn, stay.checkOut, stay.guests);
      if (!r.ok) return fail(r.code);
      router.push(`/${locale}/booking/${r.ref}`);
    });

  const longDate = (d: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  const primary: Record<Step, { label: string; run: () => void; disabled?: boolean }> = {
    phone: { label: t("sendCode"), run: sendCode, disabled: !phone.trim() },
    code: { label: t("verify"), run: checkCode, disabled: code.trim().length !== 6 },
    name: { label: t("continue"), run: submitName, disabled: name.trim().length < 2 },
    confirm: { label: t("confirmBooking"), run: confirm },
  };
  const titles: Record<Step, string> = { phone: t("phoneTitle"), code: t("codeTitle"), name: t("nameTitle"), confirm: t("confirmTitle") };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={titles[step]}
      actions={
        <>
          <Button data-autofocus={step === "confirm" ? true : undefined} onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button variant="primary" type="submit" form="guest-flow" disabled={busy || primary[step].disabled}>
            {busy ? t("working") : primary[step].label}
          </Button>
        </>
      }
    >
      <form
        id="guest-flow"
        className="grid gap-3 pt-1 text-ink"
        onSubmit={(e) => {
          e.preventDefault();
          primary[step].run();
        }}
      >
        {step === "phone" && (
          <label className="grid gap-1.5">
            <span className="text-sm text-ink-muted">{t("phoneHint")}</span>
            <input className={`${field} num`} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="010 1234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} data-autofocus />
          </label>
        )}

        {step === "code" && (
          <>
            <p className="text-sm text-ink-muted">{t("codeHint", { phone: shownPhone })}</p>
            <input
              className={`${field} num text-center tracking-[0.5em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d٠-٩]/g, "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)))}
              aria-label={t("codeLabel")}
              data-autofocus
            />
            <div className="flex flex-wrap gap-x-4 text-sm">
              <button type="button" className="font-medium text-sea-deep underline-offset-4 hover:underline disabled:text-ink-muted disabled:no-underline" disabled={resendIn > 0 || busy} onClick={sendCode}>
                {resendIn > 0 ? t("resendIn", { seconds: resendIn }) : t("resend")}
              </button>
              <button type="button" className="font-medium text-sea-deep underline-offset-4 hover:underline" onClick={() => setStep("phone")}>
                {t("changePhone")}
              </button>
            </div>
          </>
        )}

        {step === "name" && (
          <label className="grid gap-1.5">
            <span className="text-sm text-ink-muted">{t("nameHint")}</span>
            <input className={field} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-autofocus />
          </label>
        )}

        {step === "confirm" && stay && (
          <dl className="grid gap-2 text-[15px]">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("place")}</dt>
              <dd className="text-end font-medium">{stay.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("dates")}</dt>
              <dd className="num text-end">
                {longDate(stay.checkIn)} – {longDate(stay.checkOut)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("guests")}</dt>
              <dd className="num">{stay.guests}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("nights", { count: stay.nights, price: formatEGP(stay.nightlyPrice, locale) })}</dt>
              <dd className="num">{formatEGP(stay.total, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4 rounded-sm bg-lagoon-soft px-3 py-2 font-semibold">
              <dt>{t("deposit")}</dt>
              <dd className="num">{formatEGP(stay.deposit, locale)}</dd>
            </div>
            <p className="text-sm text-ink-muted">{t("confirmNote")}</p>
          </dl>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-sun-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
