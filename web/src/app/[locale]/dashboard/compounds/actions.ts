"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { checkbox, list, nullableNumber, optional, ref, text } from "@/lib/admin/form";
import { pick } from "@/lib/admin/labels";
import { dashboardHref, safeLocale } from "@/lib/admin/paths";
import { safeReturnQuery, withResult } from "@/lib/admin/result";
import type { Compound, FormState } from "@/lib/admin/types";

function payload(fd: FormData) {
  return {
    area_id: ref(fd, "area_id"),
    slug: optional(fd, "slug"),
    name_ar: text(fd, "name_ar"),
    name_en: text(fd, "name_en"),
    description_ar: text(fd, "description_ar"),
    description_en: text(fd, "description_en"),
    amenities: list(fd, "amenities"),
    beach_type: text(fd, "beach_type"),
    gate_info_ar: text(fd, "gate_info_ar"),
    gate_info_en: text(fd, "gate_info_en"),
    lat: nullableNumber(fd, "lat"),
    lng: nullableNumber(fd, "lng"),
    cover_image_url: text(fd, "cover_image_url"),
    is_featured: checkbox(fd, "is_featured"),
  };
}

export async function createCompound(locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Compound>("POST", "/compounds", payload(fd)),
    (c) => withResult(dashboardHref(l, `/compounds/${c.id}`), "created", pick(l, c.name_ar, c.name_en)),
  );
}

export async function updateCompound(id: string, locale: string, _: FormState, fd: FormData): Promise<FormState> {
  const l = safeLocale(locale);
  return mutate(
    () => adminSend<Compound>("PATCH", `/compounds/${assertId(id)}`, payload(fd)),
    (c) => withResult(dashboardHref(l, `/compounds/${c.id}`), "saved", pick(l, c.name_ar, c.name_en)),
  );
}

/** `back` is the list's query string when deleting from a list row ("" from the record page). */
export async function deleteCompound(
  id: string,
  locale: string,
  name: string,
  back: string,
  _: FormState,
): Promise<FormState> {
  return mutate(
    () => adminSend("DELETE", `/compounds/${assertId(id)}`),
    () => withResult(dashboardHref(safeLocale(locale), "/compounds") + safeReturnQuery(back), "deleted", name),
  );
}
