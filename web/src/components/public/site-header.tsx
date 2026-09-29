import { CalendarCheck2, LayoutDashboard, Sun } from "lucide-react";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { guestToken } from "@/lib/public/guest";
import { HeaderScroll } from "./header-scroll";
import { LocaleLink } from "./locale-link";

export async function SiteHeader() {
  const t = await getTranslations("public");
  const signedIn = !!(await guestToken());
  return (
    <header className="pb-header" id="site-header">
      <HeaderScroll />
      <div className="pb-wrap pb-header__row">
        <Link href="/" className="pb-brand">
          <span className="pb-brand__mark" aria-hidden="true">
            <Sun size={20} strokeWidth={2.4} />
          </span>
          {t("brand")}
        </Link>
        <nav className="pb-nav" aria-label={t("brand")}>
          <Link href={{ pathname: "/", hash: "destinations" }} className="pb-nav__hide">
            {t("nav.destinations")}
          </Link>
          <Link href="/search">{t("nav.search")}</Link>
          {signedIn && (
            <Link href="/my-bookings" aria-label={t("nav.myBookings")}>
              <CalendarCheck2 size={17} aria-hidden="true" className="inline align-[-3px] sm:hidden" />
              <span className="pb-nav__hide">{t("nav.myBookings")}</span>
            </Link>
          )}
          <Link href="/dashboard" className="pb-dash" aria-label={t("nav.dashboard")}>
            <LayoutDashboard size={17} aria-hidden="true" />
            <span className="pb-nav__hide">{t("nav.dashboard")}</span>
          </Link>
          <Suspense>
            <LocaleLink className="pb-lang">{t("nav.switchLocale")}</LocaleLink>
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
