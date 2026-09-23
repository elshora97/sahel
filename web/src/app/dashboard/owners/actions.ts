"use server";

import { assertId, mutate } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";
import { int, text } from "@/lib/admin/form";
import type { FormState } from "@/lib/admin/types";

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

export async function createOwner(_: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("POST", "/owners", payload(fd)), "/dashboard/owners");
}

export async function updateOwner(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return mutate(() => adminSend("PATCH", `/owners/${assertId(id)}`, payload(fd)), "/dashboard/owners");
}

export async function deleteOwner(id: string, _: FormState): Promise<FormState> {
  return mutate(() => adminSend("DELETE", `/owners/${assertId(id)}`), "/dashboard/owners");
}
