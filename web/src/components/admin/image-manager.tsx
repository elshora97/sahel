"use client";

/* eslint-disable @next/next/no-img-element -- admin photos straight from MinIO */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { deleteImage, reorderImages, updateImage, uploadImage } from "@/app/[locale]/dashboard/units/image-actions";
import { Button, buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { Modal } from "@/components/ds/modal";
import { StateBadge } from "@/components/ds/state-badge";
import type { UnitImage } from "@/lib/admin/types";
import { ErrorBanner } from "./entity-form";
import { ImagePreview } from "./image-preview";
import { useToast } from "./toast";
import { inputCls } from "./ui";

type Result = { error?: string };

/**
 * Spec §4.3 + §6.2: upload and delete end in a result modal (delete asks
 * first); inline edits (cover, alt text, order) confirm with a toast.
 */
export function ImageManager({ unitId, images }: { unitId: string; images: UnitImage[] }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<UnitImage | null>(null);
  const [result, setResult] = useState<{ title: string; body: string } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  function run(task: () => Promise<Result>, onSuccess: () => void) {
    startTransition(async () => {
      setError(null);
      const outcome = await task();
      if (outcome.error) setError(outcome.error);
      else onSuccess();
      router.refresh();
    });
  }

  function uploadAll(files: File[]) {
    run(
      async () => {
        for (const file of files) {
          const fd = new FormData();
          fd.set("file", file);
          const outcome = await uploadImage(unitId, fd);
          if (outcome.error) return { error: `${file.name}: ${outcome.error}` };
        }
        return {};
      },
      () => setResult({ title: t("feedback.imagesUploadedTitle"), body: t("feedback.imagesUploaded", { count: files.length }) }),
    );
  }

  function move(index: number, delta: -1 | 1) {
    const ids = images.map((i) => i.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run(() => reorderImages(unitId, ids), () => toast(t("feedback.orderSaved")));
  }

  function saveAlt(img: UnitImage, field: "alt_ar" | "alt_en", value: string) {
    if (value === (img[field] ?? "")) return;
    run(() => updateImage(unitId, img.id, { [field]: value }), () => toast(t("feedback.altSaved")));
  }

  function confirmDelete() {
    const img = confirming;
    if (!img) return;
    startTransition(async () => {
      setError(null);
      const outcome = await deleteImage(unitId, img.id);
      setConfirming(null);
      if (outcome.error) setError(outcome.error);
      else setResult({ title: t("feedback.deleted"), body: t("feedback.imageDeleted") });
      router.refresh();
    });
  }

  return (
    <Card
      id="images"
      title={t("units.sectionImages")}
      actions={
        <label className={`${buttonClass("secondary", "sm")} ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? t("actions.working") : t("actions.addImages")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              if (files.length > 0) uploadAll(files);
            }}
          />
        </label>
      }
    >
      <p className="mb-4 text-xs text-ink-muted">{t("units.imagesHint")}</p>
      {error && (
        <div className="mb-4">
          <ErrorBanner title={t("feedback.notSaved")} message={error} />
        </div>
      )}

      {images.length === 0 ? (
        <div className="rounded-lg bg-sand px-6 py-12 text-center text-sm text-ink">{t("units.noImages")}</div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {images.map((img, i) => (
            <li key={`${img.id}-${img.updated_at}`} className="flex min-w-0 flex-col gap-2">
              <button
                type="button"
                onClick={() => setPreview(i)}
                aria-label={t("units.previewOpen", { n: i + 1 })}
                className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea"
              >
                <img src={img.url} alt={img.alt_en ?? img.alt_ar ?? ""} className="h-full w-full object-cover transition-opacity group-hover:opacity-90" />
                {img.is_cover && (
                  <span className="pointer-events-none absolute start-2 top-2">
                    <StateBadge tone="confirmed">{t("units.cover")}</StateBadge>
                  </span>
                )}
              </button>
              <input
                className={`${inputCls} min-h-9 py-1.5 text-sm`}
                dir="rtl"
                aria-label={t("units.altAr")}
                placeholder={t("units.altAr")}
                defaultValue={img.alt_ar ?? ""}
                onBlur={(e) => saveAlt(img, "alt_ar", e.currentTarget.value)}
              />
              <input
                className={`${inputCls} min-h-9 py-1.5 text-sm`}
                dir="ltr"
                aria-label={t("units.altEn")}
                placeholder={t("units.altEn")}
                defaultValue={img.alt_en ?? ""}
                onBlur={(e) => saveAlt(img, "alt_en", e.currentTarget.value)}
              />
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="quiet" size="sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={t("actions.moveEarlier")}>
                  <ChevronLeft className="size-5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={busy || i === images.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t("actions.moveLater")}
                >
                  <ChevronRight className="size-5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
                </Button>
                {!img.is_cover && (
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => updateImage(unitId, img.id, { is_cover: true }), () => toast(t("feedback.coverUpdated")))}
                  >
                    {t("actions.makeCover")}
                  </Button>
                )}
                <Button variant="danger" size="sm" className="ms-auto" disabled={busy} onClick={() => setConfirming(img)}>
                  {t("actions.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ImagePreview images={images} index={preview} onChange={setPreview} onClose={() => setPreview(null)} />

      <Modal
        open={confirming !== null}
        busy={busy}
        onClose={() => setConfirming(null)}
        title={t("confirm.imageTitle")}
        actions={
          <>
            <Button variant="secondary" data-autofocus disabled={busy} onClick={() => setConfirming(null)}>
              {t("actions.cancel")}
            </Button>
            <Button variant="danger" disabled={busy} onClick={confirmDelete}>
              {busy ? t("actions.deleting") : t("actions.delete")}
            </Button>
          </>
        }
      >
        <p>{t("confirm.deleteBody")}</p>
        <p>{t("confirm.image")}</p>
      </Modal>

      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        title={result?.title ?? ""}
        actions={
          <Button variant="primary" data-autofocus onClick={() => setResult(null)}>
            {t("actions.done")}
          </Button>
        }
      >
        <p>{result?.body}</p>
      </Modal>
    </Card>
  );
}
