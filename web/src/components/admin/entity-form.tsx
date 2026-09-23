"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";

import { Button, buttonClass } from "@/components/ds/button";
import type { FormAction } from "@/lib/admin/types";
import { GuardedLink } from "./guarded-link";
import { useUnsavedChanges } from "./unsaved-changes";

export function ErrorBanner({ title, message, ref }: { title: string; message: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-md border border-danger bg-surface px-4 py-3 text-sm outline-none">
      <p className="font-medium text-danger">{title}</p>
      <p className="mt-1 text-ink">{message}</p>
    </div>
  );
}

/**
 * Submits through onSubmit (not <form action>): React 19 resets action
 * forms, which would wipe the admin's input on a validation error. Tracks
 * dirtiness for the save-bar hint and the leave guard; errors land in a
 * focused banner; success is the redirect's result modal.
 */
export function EntityForm({
  formId,
  action,
  submitLabel,
  cancelHref,
  sections,
  children,
}: {
  formId: string;
  action: FormAction;
  submitLabel: string;
  cancelHref: string;
  sections?: Array<{ id: string; label: string }>;
  children: ReactNode;
}) {
  const t = useTranslations("admin");
  const [state, dispatch, pending] = useActionState(action, null);
  const { setDirty } = useUnsavedChanges();
  const [dirty, setLocalDirty] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  const mark = (value: boolean) => {
    setLocalDirty(value);
    setDirty(formId, value);
  };

  useEffect(() => () => setDirty(formId, false), [formId, setDirty]);

  useEffect(() => {
    if (!state?.error) return;
    mark(true);
    bannerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    bannerRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a new result only
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    mark(false); // the success redirect must not trip the leave guard
    startTransition(() => dispatch(data));
  }

  const onEdit = () => {
    if (!dirty) mark(true);
  };

  return (
    <form id={formId} onSubmit={onSubmit} onInput={onEdit} onChange={onEdit} className="space-y-6">
      {sections && (
        <nav aria-label={t("form.sections")} className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md bg-sea-soft px-3 py-1.5 text-sm text-sea-deep hover:bg-lagoon-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea"
            >
              {s.label}
            </a>
          ))}
        </nav>
      )}
      {state?.error && <ErrorBanner ref={bannerRef} title={t("feedback.notSaved")} message={state.error} />}
      {children}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface px-4 py-3 shadow-sheet sm:-mx-10 sm:px-10">
        <span aria-live="polite" className="text-sm text-ink-muted">
          {dirty ? t("feedback.unsavedHint") : ""}
        </span>
        <div className="ms-auto flex items-center gap-2.5">
          <GuardedLink href={cancelHref} className={buttonClass("secondary")}>
            {t("actions.cancel")}
          </GuardedLink>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? t("actions.saving") : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
