"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, list, nullableNumber, optional, ref, text } from "@/lib/admin/form";
import type { FormState, Unit } from "@/lib/admin/types";

function payload(fd: FormData) {
  return {
    owner_id: ref(fd, "owner_id"),
    compound_id: ref(fd, "compound_id"),
    slug: optional(fd, "slug"),
    title_ar: text(fd, "title_ar"),
    title_en: text(fd, "title_en"),
    description_ar: text(fd, "description_ar"),
    description_en: text(fd, "description_en"),
    house_rules_ar: text(fd, "house_rules_ar"),
    house_rules_en: text(fd, "house_rules_en"),
    type: text(fd, "type"),
    view: text(fd, "view"),
    status: text(fd, "status"),
    bedrooms: int(fd, "bedrooms"),
    bathrooms: int(fd, "bathrooms"),
    base_guests: int(fd, "base_guests"),
    max_guests: int(fd, "max_guests"),
    sea_distance_m: int(fd, "sea_distance_m"),
    area_sqm: nullableNumber(fd, "area_sqm"),
    floor: nullableNumber(fd, "floor"),
    row_number: nullableNumber(fd, "row_number"),
    amenities: list(fd, "amenities"),
    lat: nullableNumber(fd, "lat"),
    lng: nullableNumber(fd, "lng"),
    exact_address: text(fd, "exact_address"),
  };
}

/** New units land on their edit page, where the image manager lives. */
export async function createUnit(_: FormState, fd: FormData): Promise<FormState> {
  return mutate(
    () => adminSend<Unit>("POST", "/units", payload(fd)),
    (unit) => `/dashboard/units/${unit.id}`,
  );
}

export async function updateUnit(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("PATCH", `/units/${assertId(id)}`, payload(fd)), `/dashboard/units/${id}`);
}

export async function deleteUnit(id: string, _: FormState): Promise<FormState> {
  return mutate(() => adminSend("DELETE", `/units/${assertId(id)}`), "/dashboard/units");
}
