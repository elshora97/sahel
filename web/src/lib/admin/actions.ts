import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError } from "./api";
import type { FormState } from "./types";

/** Helpers for Server Actions. Not a "use server" module itself. */

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Runs an API write. On failure the form gets an error banner; on success
 * every dashboard page is revalidated and the browser is sent to `next`.
 */
export async function mutate<T>(
  run: () => Promise<T>,
  next: string | ((result: T) => string),
): Promise<FormState> {
  const outcome = await run().then(
    (value) => ({ ok: true as const, value }),
    (e: unknown) => ({ ok: false as const, error: errorMessage(e) }),
  );
  if (!outcome.ok) return { error: outcome.error };
  revalidatePath("/dashboard", "layout");
  redirect(typeof next === "string" ? next : next(outcome.value));
}

/** Like mutate, for in-place edits (images) that stay on the page. */
export async function attempt(run: () => Promise<unknown>, revalidate: string): Promise<{ error?: string }> {
  try {
    await run();
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(revalidate);
  return {};
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server Actions are public endpoints; never splice an unchecked id into a URL. */
export function assertId(id: string): string {
  if (!uuidPattern.test(id)) throw new Error(`invalid id ${JSON.stringify(id)}`);
  return id;
}
