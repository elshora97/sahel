"use client";

import type { ReactNode } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";

import { usePathname } from "@/i18n/navigation";

/** The same page in the other language, query string kept. */
export function LocaleLink({ className, children }: { className?: string; children: ReactNode }) {
  const locale = useLocale();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const next = locale === "ar" ? "en" : "ar";
  // A full load, so the new <html lang dir> and fonts apply cleanly.
  return (
    <a href={`/${next}${pathname === "/" ? "" : pathname}${query ? `?${query}` : ""}`} hrefLang={next} lang={next} className={className}>
      {children}
    </a>
  );
}
