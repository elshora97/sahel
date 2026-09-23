/** Display helpers shared by admin pages. Pure. */

export type Tone = "free" | "held" | "confirmed" | "neutral" | "muted" | "blocked" | "attention" | "danger";

export function unitStatusTone(status: string): Tone {
  switch (status) {
    case "active":
      return "confirmed";
    case "paused":
      return "attention";
    case "archived":
      return "muted";
    default:
      return "neutral";
  }
}

/** The text in the page's language, falling back to the other one. */
export function pick(locale: string, ar: string | null | undefined, en: string | null | undefined): string {
  return (locale === "ar" ? ar || en : en || ar) ?? "";
}

/** The text in the other language (shown muted under the main one). */
export function other(locale: string, ar: string | null | undefined, en: string | null | undefined): string {
  return (locale === "ar" ? en : ar) ?? "";
}

export function enumOptions(values: string[], label: (value: string) => string) {
  return values.map((value) => ({ value, label: label(value) }));
}

export function formatWhen(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  });
}
