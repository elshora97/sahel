"use client";

import { Eye, EyeOff, LockKeyhole, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { buttonClass } from "@/components/ds/button";
import { inputCls, labelCls } from "@/components/admin/ui";
import { signIn, type SignInState } from "./actions";

/** The dashboard's sign-in, shown as a dialog over the brand backdrop. */
export function LoginDialog({ locale, next }: { locale: "ar" | "en"; next: string }) {
  const t = useTranslations("admin.login");
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn.bind(null, locale, next), null);
  const [show, setShow] = useState(false);

  return (
    <div className="pb-login">
      <div className="pb-login__card" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div className="pb-login__brand">
          <span className="pb-brand__mark" aria-hidden="true">
            <Sun size={20} strokeWidth={2.4} />
          </span>
          <span className="display text-xl font-bold text-sea-deep">{t("brand")}</span>
        </div>
        <div className="pb-login__icon" aria-hidden="true">
          <LockKeyhole size={26} />
        </div>
        <h1 id="login-title" className="text-2xl font-bold">
          {t("title")}
        </h1>
        <p className="text-sm text-ink-muted">{t("subtitle")}</p>

        <form action={action} className="grid gap-4 text-start">
          <label>
            <span className={labelCls}>{t("username")}</span>
            <input className={inputCls} name="username" autoComplete="username" dir="ltr" required autoFocus />
          </label>
          <label>
            <span className={labelCls}>{t("password")}</span>
            <span className="relative block">
              <input className={`${inputCls} pe-11`} name="password" type={show ? "text" : "password"} autoComplete="current-password" dir="ltr" required />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-md text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-sea"
                aria-label={show ? t("hidePassword") : t("showPassword")}
                aria-pressed={show}
              >
                {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </span>
          </label>
          {state?.error && (
            <p role="alert" className="rounded-md bg-sun-soft px-3 py-2 text-sm text-danger">
              {t(`errors.${state.error}`)}
            </p>
          )}
          <button type="submit" className={buttonClass("primary", "lg", true)} disabled={pending}>
            {pending ? t("signingIn") : t("submit")}
          </button>
        </form>
        <a href={`/${locale}`} className="text-sm font-medium text-sea-deep underline-offset-4 hover:underline">
          {t("backToSite")}
        </a>
      </div>
    </div>
  );
}
