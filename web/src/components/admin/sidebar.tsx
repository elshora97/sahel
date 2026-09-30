"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button, buttonClass } from "@/components/ds/button";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/[locale]/login/actions";
import { GuardedLink } from "./guarded-link";
import { focusRing } from "./ui";

const items = [
  ["overview", "/dashboard"],
  ["areas", "/dashboard/areas"],
  ["compounds", "/dashboard/compounds"],
  ["owners", "/dashboard/owners"],
  ["units", "/dashboard/units"],
  ["bookings", "/dashboard/bookings"],
  ["timeline", "/dashboard/timeline"],
  ["payments", "/dashboard/payments"],
  ["settings", "/dashboard/settings"],
] as const;

/** The app design's 232px sidebar; below 1024px, a top bar with the nav in a sheet. */
export function Sidebar({ pendingPayments = 0 }: { pendingPayments?: number }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const pathname = usePathname(); // without the locale prefix
  const search = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const otherLocale = locale === "ar" ? "en" : "ar";

  const nav = (
    <nav aria-label={t("shell.navLabel")} className="flex flex-col gap-0.5">
      {items.map(([key, href]) => {
        const active = isActive(href);
        return (
          <GuardedLink
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center rounded-md px-3 py-2.5 text-[15px]",
              focusRing,
              active ? "bg-sea-soft font-medium text-sea-deep" : "text-ink hover:bg-sea-soft/60",
            )}
          >
            {t(`nav.${key}`)}
            {key === "payments" && pendingPayments > 0 && (
              <span className="num ms-auto min-w-6 rounded-full bg-sun px-2 text-center text-xs leading-6 font-bold text-ink" aria-label={t("payments.pendingBadge", { count: pendingPayments })}>
                {pendingPayments}
              </span>
            )}
          </GuardedLink>
        );
      })}
    </nav>
  );

  const foot = (
    <div className="mt-auto flex flex-col gap-3 border-t border-line px-3 pt-4">
      <GuardedLink
        href={{ pathname, query: Object.fromEntries(search.entries()) }}
        locale={otherLocale}
        lang={otherLocale}
        className={buttonClass("secondary", "sm")}
      >
        {t("shell.switchLanguage")}
      </GuardedLink>
      <form action={signOut.bind(null, locale)} className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">{t("shell.role")}</span>
        <button type="submit" className={buttonClass("quiet", "sm")}>
          {t("login.signOut")}
        </button>
      </form>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-6 border-e border-line bg-surface px-4 py-5 lg:flex">
        <div className="flex flex-col gap-0.5 px-3">
          <span className="display text-2xl font-bold text-sea-deep">{t("shell.brand")}</span>
          <span className="text-[13px] text-ink-muted">{t("shell.subtitle")}</span>
        </div>
        {nav}
        {foot}
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
        <span className="display text-xl font-bold text-sea-deep">{t("shell.brand")}</span>
        <Button
          variant="secondary"
          size="sm"
          className="ms-auto"
          aria-expanded={open}
          aria-controls="admin-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t("shell.closeMenu") : t("shell.openMenu")}
        </Button>
      </header>
      {open && (
        <div
          id="admin-menu"
          className="fixed inset-x-0 top-[57px] z-20 flex flex-col gap-6 border-b border-line bg-surface p-4 shadow-sheet lg:hidden"
        >
          {nav}
          {foot}
        </div>
      )}
    </>
  );
}
