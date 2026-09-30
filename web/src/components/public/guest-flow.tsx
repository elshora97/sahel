"use client";

import { Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";
import { looksLikeMobile } from "@/lib/public/phone";
import { formatEGP } from "@/lib/utils";
import { bookStay, signIn, signUp } from "@/app/[locale]/(public)/guest-actions";
import { startNavProgress } from "@/components/ds/nav-progress";

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

type Step = "signin" | "register" | "confirm";

const field =
  "min-h-[48px] w-full rounded-md border border-line-control bg-surface px-3 text-[17px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea";

/**
 * Sign in or create an account (name, phone, password), then, for a booking,
 * the summary and confirmation, in one dialog. Without `stay` it only signs
 * in and refreshes the page.
 */
export function GuestFlow({
  open,
  onClose,
  signedIn,
  stay,
}: {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  stay?: StaySummary;
}) {
  const t = useTranslations("public.guest");
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<Step>("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const booking = !!stay;
  // Only when the dialog opens: later prop changes must not reset the step.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setStep(signedIn && booking ? "confirm" : "signin");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fail = (c: string) => setError(t.has(`errors.${c}`) ? t(`errors.${c}` as "errors.error") : t("errors.error"));
  const done = () => {
    setPassword("");
    router.refresh(); // the header and page now know the guest is signed in
    if (booking) return setStep("confirm");
    onClose();
  };

  const submitAuth = () => {
    if (!looksLikeMobile(phone)) return fail("invalid_phone");
    start(async () => {
      const r = step === "register" ? await signUp(name, phone, password) : await signIn(phone, password);
      if (!r.ok) return fail(r.code);
      setError(null);
      done();
    });
  };

  const confirm = () =>
    stay &&
    start(async () => {
      const r = await bookStay(stay.slug, stay.checkIn, stay.checkOut, stay.guests);
      if (!r.ok) return fail(r.code);
      startNavProgress();
      router.push(`/${locale}/booking/${r.ref}`);
    });

  const longDate = (d: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  const authStep = step === "signin" || step === "register";
  const canSubmit =
    step === "confirm" || (phone.trim() !== "" && password.length >= 8 && (step === "signin" || name.trim().length >= 2));
  const title = step === "confirm" ? t("confirmTitle") : step === "register" ? t("registerTitle") : t("signInTitle");
  const primaryLabel = step === "confirm" ? t("confirmBooking") : step === "register" ? t("createAccount") : t("signIn");

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={title}
      actions={
        <>
          <Button data-autofocus={step === "confirm" ? true : undefined} onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button variant="primary" type="submit" form="guest-flow" disabled={busy || !canSubmit}>
            {busy ? t("working") : primaryLabel}
          </Button>
        </>
      }
    >
      <form
        id="guest-flow"
        className="grid gap-3 pt-1 text-ink"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "confirm") confirm();
          else submitAuth();
        }}
      >
        {authStep && (
          <>
            <div role="tablist" className="grid grid-cols-2 rounded-md bg-sea-soft p-1 text-sm font-medium">
              {(["signin", "register"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={step === s}
                  onClick={() => {
                    setStep(s);
                    setError(null);
                  }}
                  className={`min-h-10 rounded-sm transition-colors ${step === s ? "bg-surface text-sea-deep shadow-card" : "text-ink-muted hover:text-ink"}`}
                >
                  {s === "signin" ? t("haveAccount") : t("newHere")}
                </button>
              ))}
            </div>

            {step === "register" && (
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">{t("name")}</span>
                <input className={field} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </label>
            )}
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">{t("phone")}</span>
              <input className={`${field} num`} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="010 1234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} data-autofocus />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">{t("password")}</span>
              <span className="relative block">
                <input
                  className={`${field} pe-12`}
                  type={show ? "text" : "password"}
                  autoComplete={step === "register" ? "new-password" : "current-password"}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={72}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute inset-y-0 end-0 grid w-12 place-items-center text-ink-muted hover:text-ink"
                  aria-label={show ? t("hidePassword") : t("showPassword")}
                  aria-pressed={show}
                >
                  {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </span>
              <span className="text-xs text-ink-muted">{step === "register" ? t("passwordRule") : t("forgot")}</span>
            </label>
          </>
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
