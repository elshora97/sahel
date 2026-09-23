"use server";

import { adminGet } from "@/lib/admin/api";

const sluggable = new Set(["areas", "compounds", "units"]);

/** True when another record of `entity` already uses `slug`. */
export async function slugTaken(entity: string, slug: string, currentId?: string): Promise<boolean> {
  if (!sluggable.has(entity) || slug === "") return false;
  const rows = await adminGet<Array<{ id: string }>>(`/${entity}?slug=${encodeURIComponent(slug)}`);
  return rows.some((r) => r.id !== currentId);
}
