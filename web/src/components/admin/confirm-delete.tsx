"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { Modal } from "@/components/ds/modal";
import type { FormAction } from "@/lib/admin/types";
import { ErrorBanner } from "./entity-form";

/** Spec §6.2: delete always asks first; a failure (e.g. 409) closes the modal and shows the banner. */
export function ConfirmDelete({ action, name, detail }: { action: FormAction; name: string; detail: string }) {
  const t = useTranslations("admin");
  const [state, dispatch, pending] = useActionState(action, null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.error) setOpen(false);
  }, [state]);

  return (
    <Card title={t("form.dangerZone")}>
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-ink-muted">{detail}</p>
        <Button variant="danger" className="ms-auto" onClick={() => setOpen(true)}>
          {t("actions.delete")}
        </Button>
      </div>
      {state?.error && (
        <div className="mt-4">
          <ErrorBanner title={t("feedback.cantDelete")} message={state.error} />
        </div>
      )}
      <Modal
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title={t("confirm.deleteTitle", { name })}
        actions={
          <>
            <Button variant="secondary" data-autofocus disabled={pending} onClick={() => setOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => startTransition(() => dispatch(new FormData()))}>
              {pending ? t("actions.deleting") : t("actions.delete")}
            </Button>
          </>
        }
      >
        <p>{t("confirm.deleteBody")}</p>
        <p>{detail}</p>
      </Modal>
    </Card>
  );
}
