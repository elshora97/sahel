"use server";

import { revalidatePath } from "next/cache";

import { assertId } from "@/lib/admin/actions";
import { ApiError, adminSend } from "@/lib/admin/api";

const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");

/** Answers with the API's error code, which the timeline turns into words. */
async function run(send: () => Promise<unknown>): Promise<{ error?: string }> {
  try {
    await send();
  } catch (e) {
    return { error: e instanceof ApiError ? e.code : "error" };
  }
  revalidatePath("/[locale]/dashboard", "layout");
  return {};
}

export async function createBlock(unitId: string, start: string, end: string, note: string) {
  return run(() =>
    adminSend("POST", `/units/${assertId(unitId)}/blocks`, { start: day(start), end: day(end), note: String(note).slice(0, 200) }),
  );
}

export async function deleteBlock(id: string) {
  return run(() => adminSend("DELETE", `/blocks/${assertId(id)}`));
}
