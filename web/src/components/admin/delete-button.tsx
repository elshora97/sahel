"use client";

import { startTransition, useActionState } from "react";

import type { FormAction } from "@/lib/admin/types";
import { ErrorBanner } from "./entity-form";
import { dangerButtonCls } from "./ui";

/** Confirms, then deletes. A 409 ("still referenced") shows as a banner. */
export function DeleteButton({ action, what }: { action: FormAction; what: string }) {
  const [state, dispatch, pending] = useActionState(action, null);
  return (
    <div className="space-y-3">
      {state?.error && <ErrorBanner message={state.error} />}
      <button
        type="button"
        className={dangerButtonCls}
        disabled={pending}
        onClick={() => {
          if (confirm(`Delete this ${what}? This cannot be undone.`)) {
            startTransition(() => dispatch(new FormData()));
          }
        }}
      >
        {pending ? "Deleting…" : `Delete ${what}`}
      </button>
    </div>
  );
}

export function DangerZone({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-12 space-y-3 border-t border-border pt-6">
      <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
      {children}
    </section>
  );
}
