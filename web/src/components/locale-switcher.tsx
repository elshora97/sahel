"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition } from "react";

export function LocaleSwitcher() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const next = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          router.replace(pathname, { locale: next });
        })
      }
      className="rounded-md border border-border px-3 py-1.5 text-sm text-ink transition-colors hover:bg-sand disabled:opacity-50"
    >
      {t("switchTo")}
    </button>
  );
}
