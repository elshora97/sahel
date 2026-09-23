"use client";

/* eslint-disable @next/next/no-img-element -- admin thumbnails straight from MinIO */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteImage, reorderImages, updateImage, uploadImage } from "@/app/dashboard/units/image-actions";
import type { UnitImage } from "@/lib/admin/types";
import { ErrorBanner } from "./entity-form";
import { dangerButtonCls, inputCls, secondaryButtonCls } from "./ui";

type Result = { error?: string };

/**
 * Spec §4.3: upload (one request per file), alt text per image, up/down
 * reorder, single-choice cover, delete with confirm. Every change goes
 * straight to the API and the page re-fetches.
 */
export function ImageManager({ unitId, images }: { unitId: string; images: UnitImage[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function run(task: () => Promise<Result>) {
    startTransition(async () => {
      setError(null);
      const result = await task();
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function uploadAll(files: File[]) {
    run(async () => {
      for (const file of files) {
        const fd = new FormData();
        fd.set("file", file);
        const result = await uploadImage(unitId, fd);
        if (result.error) return { error: `${file.name}: ${result.error}` };
      }
      return {};
    });
  }

  function move(index: number, delta: -1 | 1) {
    const ids = images.map((i) => i.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run(() => reorderImages(unitId, ids));
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Images</h2>
        <label className={`${secondaryButtonCls} cursor-pointer`}>
          {busy ? "Working…" : "Add images"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              if (files.length > 0) uploadAll(files);
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 10 MB each. The first image becomes the cover.</p>
      {error && <ErrorBanner message={error} />}

      {images.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No images yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, i) => (
            <li key={`${img.id}-${img.updated_at}`} className="space-y-3 rounded-lg border border-border bg-white p-3">
              <img src={img.url} alt={img.alt_en ?? ""} className="aspect-[4/3] w-full rounded object-cover" />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`cover-${unitId}`}
                  checked={img.is_cover}
                  disabled={busy}
                  onChange={() => run(() => updateImage(unitId, img.id, { is_cover: true }))}
                  className="accent-sea"
                />
                Cover
              </label>
              <input
                className={inputCls}
                dir="rtl"
                placeholder="النص البديل"
                defaultValue={img.alt_ar ?? ""}
                onBlur={(e) => {
                  if (e.currentTarget.value !== (img.alt_ar ?? "")) {
                    const alt_ar = e.currentTarget.value;
                    run(() => updateImage(unitId, img.id, { alt_ar }));
                  }
                }}
              />
              <input
                className={inputCls}
                dir="ltr"
                placeholder="Alt text"
                defaultValue={img.alt_en ?? ""}
                onBlur={(e) => {
                  if (e.currentTarget.value !== (img.alt_en ?? "")) {
                    const alt_en = e.currentTarget.value;
                    run(() => updateImage(unitId, img.id, { alt_en }));
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <button type="button" className={secondaryButtonCls} disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">
                  ↑
                </button>
                <button
                  type="button"
                  className={secondaryButtonCls}
                  disabled={busy || i === images.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move later"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={`${dangerButtonCls} ms-auto px-3 py-1.5`}
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Delete this image?")) run(() => deleteImage(unitId, img.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
