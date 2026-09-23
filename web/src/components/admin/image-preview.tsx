"use client";

/* eslint-disable @next/next/no-img-element -- admin photos straight from MinIO */
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ds/button";
import type { UnitImage } from "@/lib/admin/types";

/**
 * Large preview of one unit image in a native <dialog>: focus trapped,
 * Escape closes, previous/next with buttons or the arrow keys (mirrored in
 * RTL, so the arrow that points "back" goes to the previous image).
 */
export function ImagePreview({
  images,
  index,
  onChange,
  onClose,
}: {
  images: UnitImage[];
  index: number | null;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.units");
  const ref = useRef<HTMLDialogElement>(null);
  const open = index !== null && images[index] !== undefined;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const current = index ?? 0;
  const img = open ? images[current] : null;
  const hasPrev = open && current > 0;
  const hasNext = open && current < images.length - 1;

  return (
    <dialog
      ref={ref}
      aria-label={t("previewTitle")}
      onClose={() => {
        if (open) onClose();
      }}
      onKeyDown={(e) => {
        if (!open) return;
        const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
        const back = rtl ? "ArrowRight" : "ArrowLeft";
        const forward = rtl ? "ArrowLeft" : "ArrowRight";
        if (e.key === back && hasPrev) onChange(current - 1);
        if (e.key === forward && hasNext) onChange(current + 1);
      }}
      // Sized to the photo, never scrolling: the image shrinks only when the screen is too small for it.
      className="m-auto max-h-[calc(100dvh-2rem)] w-fit max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg bg-surface p-0 text-ink shadow-sheet backdrop:bg-ink/70"
    >
      {img && (
        <div className="flex min-w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <p className="num text-sm text-ink-muted">{t("previewCounter", { n: current + 1, total: images.length })}</p>
            <Button variant="secondary" size="sm" className="ms-auto" onClick={onClose} aria-label={t("previewClose")}>
              <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </div>
          <img
            src={img.url}
            alt={img.alt_en ?? img.alt_ar ?? ""}
            className="mx-auto block h-auto max-h-[calc(100dvh-12rem)] w-auto max-w-full rounded-lg"
          />
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" disabled={!hasPrev} onClick={() => onChange(current - 1)} aria-label={t("previewPrev")}>
              <ChevronLeft className="size-5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
            </Button>
            <div className="min-w-0 flex-1 text-center text-sm">
              {img.alt_ar && <p dir="rtl">{img.alt_ar}</p>}
              {img.alt_en && (
                <p dir="ltr" className="text-ink-muted">
                  {img.alt_en}
                </p>
              )}
            </div>
            <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => onChange(current + 1)} aria-label={t("previewNext")}>
              <ChevronRight className="size-5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
