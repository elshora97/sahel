"use client";

import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { buttonClass } from "@/components/ds/button";

export type GalleryImage = { url: string; alt: string };

/**
 * Cover plus up to four photos; any of them opens a full-screen lightbox on a
 * native <dialog> (focus trapped, Escape closes, focus returns). Arrow keys
 * and horizontal swipes move between photos.
 */
export function Gallery({ images, title, transitionName }: { images: GalleryImage[]; title: string; transitionName: string }) {
  const t = useTranslations("public");
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<number | null>(null);
  const total = images.length;

  const open = (i: number) => {
    setIndex(i);
    dialog.current?.showModal();
  };
  // In RTL the "next" photo sits to the left, so a swipe direction flips too.
  const step = useCallback((delta: number) => setIndex((i) => (i + delta + total) % total), [total]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      const rtl = document.dir === "rtl";
      if (e.key === "ArrowRight") step(rtl ? -1 : 1);
      if (e.key === "ArrowLeft") step(rtl ? 1 : -1);
    };
    d.addEventListener("keydown", onKey);
    return () => d.removeEventListener("keydown", onKey);
  }, [step]);

  if (total === 0) return <div className="pb-cover" style={{ viewTransitionName: transitionName }} />;

  const shown = images.slice(0, 5);
  const current = images[index];

  return (
    <>
      <div className="pb-gallery" data-count={shown.length}>
        {shown.map((img, i) => (
          <button
            key={img.url}
            type="button"
            className="pb-gallery__shot"
            onClick={() => open(i)}
            style={i === 0 ? { viewTransitionName: transitionName } : undefined}
            aria-label={img.alt || t("lightbox.counter", { index: i + 1, total })}
          >
            <img src={img.url} alt="" loading={i === 0 ? "eager" : "lazy"} decoding="async" />
          </button>
        ))}
        {total > 1 && (
          <button type="button" className={`${buttonClass("secondary", "sm")} pb-gallery__all`} onClick={() => open(0)}>
            <Images size={16} aria-hidden="true" />
            {t("unit.photos", { count: total })}
          </button>
        )}
      </div>

      <dialog
        ref={dialog}
        className="pb-lightbox"
        aria-label={t("lightbox.label", { title })}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <div className="pb-lightbox__bar">
          <span className="num" aria-live="polite">
            {t("lightbox.counter", { index: index + 1, total })}
          </span>
          <button type="button" className="pb-lightbox__btn" onClick={() => dialog.current?.close()} aria-label={t("lightbox.close")} autoFocus>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div
          className="pb-lightbox__stage"
          onPointerDown={(e) => (swipeStart.current = e.clientX)}
          onPointerUp={(e) => {
            if (swipeStart.current === null) return;
            const dx = e.clientX - swipeStart.current;
            swipeStart.current = null;
            if (Math.abs(dx) < 40) return;
            const rtl = document.dir === "rtl";
            step((dx < 0) !== rtl ? 1 : -1);
          }}
        >
          {current && <img key={current.url} src={current.url} alt={current.alt} draggable={false} />}
          {total > 1 && (
            <>
              <button type="button" className="pb-lightbox__btn pb-lightbox__nav pb-lightbox__nav--prev" onClick={() => step(-1)} aria-label={t("lightbox.prev")}>
                <ChevronLeft size={24} className="pb-flip" aria-hidden="true" />
              </button>
              <button type="button" className="pb-lightbox__btn pb-lightbox__nav pb-lightbox__nav--next" onClick={() => step(1)} aria-label={t("lightbox.next")}>
                <ChevronRight size={24} className="pb-flip" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        <div className="pb-thumbs">
          {images.map((img, i) => (
            <button key={img.url} type="button" onClick={() => setIndex(i)} aria-current={i === index} aria-label={t("lightbox.counter", { index: i + 1, total })}>
              <img src={img.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </dialog>
    </>
  );
}
