"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, nullableNumber, optional, text } from "@/lib/admin/form";
import { pick } from "@/lib/admin/labels";
import { dashboardHref, safeLocale } from "@/lib/admin/paths";
import { safeReturnQuery, withResult } from "@/lib/admin/result";
import type { Area, FormState } from "@/lib/admin/types";

function payload(fd: FormData) {
  return {
    slug: optional(fd, "slug"),
    name_ar: text(fd, "name_ar"),
    name_en: text(fd, "name_en"),
    region: text(fd, "region"),
    km_marker: nullableNumber(fd, "km_marker"),
    sort_order: int(fd, "sort_order") ?? 0,
  };
}

export async function createArea(locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Area>("POST", "/areas", payload(fd)),
    (a) => withResult(dashboardHref(l, `/areas/${a.id}`), "created", pick(l, a.name_ar, a.name_en)),
  );
}

export async function updateArea(id: string, locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Area>("PATCH", `/areas/${assertId(id)}`, payload(fd)),
    (a) => withResult(dashboardHref(l, `/areas/${a.id}`), "saved", pick(l, a.name_ar, a.name_en)),
  );
}

/** `back` is the list's query string when deleting from a list row ("" from the record page). */
export async function deleteArea(
  id: string,
  locale: string,
  name: string,
  back: string,
  _: FormState,
): Promise<FormState> {
  return mutate(
    () => adminSend("DELETE", `/areas/${assertId(id)}`),
    () => withResult(dashboardHref(safeLocale(locale), "/areas") + safeReturnQuery(back), "deleted", name),
  );
}
