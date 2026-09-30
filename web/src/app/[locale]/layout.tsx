import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alexandria, Baloo_Bhaijaan_2, Readex_Pro } from "next/font/google";

import { Suspense } from "react";

import { NavProgress } from "@/components/ds/nav-progress";
import { direction, routing, type Locale } from "@/i18n/routing";
import "../globals.css";

/*
  One family for both scripts, which is the whole reason it was chosen:
  the page keeps a single voice when it flips direction.
*/
const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["200", "400", "500", "600"],
  variable: "--font-readex",
  display: "swap",
});

/* The display voice: rounded, warm, and drawn for Arabic and Latin alike. */
const baloo = Baloo_Bhaijaan_2({
  subsets: ["arabic", "latin"],
  weight: ["500", "700"],
  variable: "--font-baloo",
  display: "swap",
});

/* The guest pages' display voice: an Egyptian-drawn geometric face, set light and large. */
const alexandria = Alexandria({
  subsets: ["arabic", "latin"],
  weight: ["300", "500"],
  variable: "--font-alexandria",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      languages: { ar: "/ar", en: "/en" },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={direction[locale as Locale]}>
      <body className={`${readex.variable} ${baloo.variable} ${alexandria.variable}`}>
        <Suspense>
          <NavProgress />
        </Suspense>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
