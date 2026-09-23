"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { checkbox, list, nullableNumber, optional, ref, text } from "@/lib/admin/form";
import type { FormState } from "@/lib/admin/types";

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

export async function createCompound(_: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("POST", "/compounds", payload(fd)), "/dashboard/compounds");
}

export async function updateCompound(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("PATCH", `/compounds/${assertId(id)}`, payload(fd)), "/dashboard/compounds");
}

export async function deleteCompound(id: string, _: FormState): Promise<FormState> {
  return mutate(() => adminSend("DELETE", `/compounds/${assertId(id)}`), "/dashboard/compounds");
}
