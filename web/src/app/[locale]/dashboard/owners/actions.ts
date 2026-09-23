"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, text } from "@/lib/admin/form";
import { dashboardHref, safeLocale } from "@/lib/admin/paths";
import { safeReturnQuery, withResult } from "@/lib/admin/result";
import type { FormState, Owner } from "@/lib/admin/types";

function payload(fd: FormData) {
  return {
    name: text(fd, "name"),
    phone: text(fd, "phone"),
    email: text(fd, "email"),
    national_id: text(fd, "national_id"),
    notes: text(fd, "notes"),
    commission_pct: int(fd, "commission_pct") ?? 0,
  };
}

export async function createOwner(locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Owner>("POST", "/owners", payload(fd)),
    (o) => withResult(dashboardHref(l, `/owners/${o.id}`), "created", o.name),
  );
}

export async function updateOwner(id: string, locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Owner>("PATCH", `/owners/${assertId(id)}`, payload(fd)),
    (o) => withResult(dashboardHref(l, `/owners/${o.id}`), "saved", o.name),
  );
}

/** `back` is the list's query string when deleting from a list row ("" from the record page). */
export async function deleteOwner(
  id: string,
  locale: string,
  name: string,
  back: string,
  _: FormState,
): Promise<FormState> {
  return mutate(
    () => adminSend("DELETE", `/owners/${assertId(id)}`),
    () => withResult(dashboardHref(safeLocale(locale), "/owners") + safeReturnQuery(back), "deleted", name),
  );
}
