"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, nullableNumber, optional, text } from "@/lib/admin/form";
import type { FormState } from "@/lib/admin/types";

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

export async function createArea(_: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("POST", "/areas", payload(fd)), "/dashboard/areas");
}

export async function updateArea(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("PATCH", `/areas/${assertId(id)}`, payload(fd)), "/dashboard/areas");
}

export async function deleteArea(id: string, _: FormState): Promise<FormState> {
  return mutate(() => adminSend("DELETE", `/areas/${assertId(id)}`), "/dashboard/areas");
}
