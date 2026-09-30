import { CalendarCheck2, LayoutDashboard, Search, Sun } from "lucide-react";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { guestToken } from "@/lib/public/guest";
import { HeaderScroll } from "./header-scroll";
import { LocaleLink } from "./locale-link";

/**
 * On phones the links collapse to icons (their names stay as aria-labels) so
 * the header always fits one row; from 640px the words show again.
 */
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
          <Link href={{ pathname: "/", hash: "destinations" }} className="pb-nav__wide">
            {t("nav.destinations")}
          </Link>
          <Link href="/search" aria-label={t("nav.search")}>
            <Search size={18} aria-hidden="true" className="pb-nav__icon" />
            <span className="pb-nav__text">{t("nav.search")}</span>
          </Link>
          {signedIn && (
            <Link href="/my-bookings" aria-label={t("nav.myBookings")}>
              <CalendarCheck2 size={18} aria-hidden="true" className="pb-nav__icon" />
              <span className="pb-nav__text">{t("nav.myBookings")}</span>
            </Link>
          )}
          <Link href="/dashboard" className="pb-dash" aria-label={t("nav.dashboard")}>
            <LayoutDashboard size={18} aria-hidden="true" />
            <span className="pb-nav__text">{t("nav.dashboard")}</span>
          </Link>
          <Suspense>
            <LocaleLink className="pb-lang">
              <span className="pb-nav__text">{t("nav.switchLocale")}</span>
              <span className="pb-nav__short" aria-hidden="true">
                {t("nav.switchLocaleShort")}
              </span>
            </LocaleLink>
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
