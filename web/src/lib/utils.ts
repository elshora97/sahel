import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Money arrives from the API as an integer number of piasters and is
 * formatted here, at the edge, and nowhere else.
 */
export function formatEGP(piasters: number, locale: string) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: piasters % 100 === 0 ? 0 : 2,
  }).format(piasters / 100);
}
