/**
 * FormData → JSON payload helpers for the admin Server Actions. Blank
 * nullable text is sent as "" on purpose: the API stores blanks as NULL,
 * which is how an admin clears a field on edit.
 */

export const text = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();

/** Omitted from the JSON body when blank (e.g. slug: "let the API derive it"). */
export const optional = (fd: FormData, key: string): string | undefined => text(fd, key) || undefined;

/** A foreign-key id; blank becomes null so the API says "x cannot be null". */
export const ref = (fd: FormData, key: string): string | null => text(fd, key) || null;

/** A NOT NULL number; blank is omitted so create reports "x is required". */
export function int(fd: FormData, key: string): number | undefined {
  const v = text(fd, key);
  return v === "" ? undefined : Number(v);
}

/** A nullable number; blank clears the column. */
export function nullableNumber(fd: FormData, key: string): number | null {
  const v = text(fd, key);
  return v === "" ? null : Number(v);
}

export const checkbox = (fd: FormData, key: string): boolean => fd.get(key) === "on";

/** Comma- (Latin or Arabic) or newline-separated input → trimmed, non-empty items. */
export function list(fd: FormData, key: string): string[] {
  return text(fd, key)
    .split(/[,،\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
