import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { safeLocale } from "@/lib/admin/paths";
import { SESSION_COOKIE, safeNext, verifySessionToken } from "@/lib/admin/session";
import { LoginDialog } from "./login-dialog";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.login" });
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = safeLocale(locale);
  const next = safeNext(l, (await searchParams).next);

  // Already signed in: straight through.
  if (await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, process.env.ADMIN_PASSWORD)) redirect(next);

  return <LoginDialog locale={l} next={next} />;
}
