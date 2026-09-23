"use server";

import { assertId, attempt } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";

type Result = { error?: string };

/** One file per request (spec §4.3); the client loops over a multi-select. */
export async function uploadImage(unitId: string, fd: FormData): Promise<Result> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  const body = new FormData();
  body.set("file", file);
  return attempt(() => adminSend("POST", `/units/${assertId(unitId)}/images`, body));
}

export async function updateImage(
  unitId: string,
  imageId: string,
  patch: { alt_ar?: string; alt_en?: string; is_cover?: boolean },
): Promise<Result> {
  return attempt(() => adminSend("PATCH", `/units/${assertId(unitId)}/images/${assertId(imageId)}`, patch));
}

/** Rewrites sort to match the given order (index = sort). */
export async function reorderImages(unitId: string, orderedIds: string[]): Promise<Result> {
  return attempt(async () => {
    for (const [sort, imageId] of orderedIds.entries()) {
      await adminSend("PATCH", `/units/${assertId(unitId)}/images/${assertId(imageId)}`, { sort });
    }
  });
}

export async function deleteImage(unitId: string, imageId: string): Promise<Result> {
  return attempt(() => adminSend("DELETE", `/units/${assertId(unitId)}/images/${assertId(imageId)}`));
}
