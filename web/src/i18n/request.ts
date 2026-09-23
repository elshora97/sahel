import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    // Public copy and admin copy live in separate files; both load per locale.
    messages: {
      ...(await import(`../messages/${locale}.json`)).default,
      ...(await import(`../messages/admin/${locale}.json`)).default,
    },
    timeZone: "Africa/Cairo",
  };
});
