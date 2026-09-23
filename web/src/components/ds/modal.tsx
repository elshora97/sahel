"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Native <dialog> opened with showModal(): focus is trapped, the page is
 * inert, Escape closes, and focus returns to the opener. Put the safe
 * button first and mark it `data-autofocus`; the confirming button goes last.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  /** While true, Escape can't close it (an action is running). */
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[440px] rounded-lg bg-surface p-6 text-ink shadow-sheet backdrop:bg-ink/40"
    >
      <h2 id={titleId} className="text-lg leading-[26px] font-medium">
        {title}
      </h2>
      {children && <div className="mt-2 space-y-1 text-[15px] leading-6 text-ink-muted">{children}</div>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">{actions}</div>
    </dialog>
  );
}
