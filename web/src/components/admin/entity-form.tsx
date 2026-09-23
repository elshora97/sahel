"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";

import type { FormAction } from "@/lib/admin/types";
import { buttonCls } from "./ui";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

/**
 * Submits through onSubmit rather than <form action>: React 19 resets an
 * action-driven form after it runs, which would wipe the admin's input
 * whenever the API rejects it. Here the fields keep their values and the
 * API's message shows in a banner above them.
 */
export function EntityForm({
  action,
  children,
  submitLabel = "Save",
}: {
  action: FormAction;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {state?.error && <ErrorBanner message={state.error} />}
      {children}
      <button type="submit" className={buttonCls} disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
