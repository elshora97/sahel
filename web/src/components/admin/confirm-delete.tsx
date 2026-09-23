"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";
import type { FormAction } from "@/lib/admin/types";

/**
 * The Delete button and its confirm modal (spec §6.2). A failure closes the
 * modal and is handed to `onError`; success is the action's redirect.
 * `compact` is the in-row variant: small, and above the row's stretched link.
 */
export function DeleteDialog({
  action,
  name,
  detail,
  compact = false,
  onError,
}: {
  action: FormAction;
  name: string;
  detail: string;
  compact?: boolean;
  onError: (message: string) => void;
}) {
  const t = useTranslations("admin");
  const [state, dispatch, pending] = useActionState(action, null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!state?.error) return;
    setOpen(false);
    onError(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a new result only
  }, [state]);

  return (
    <>
      <Button
        variant="danger"
        size={compact ? "sm" : "md"}
        className={compact ? "relative z-10" : undefined}
        aria-label={compact ? `${t("actions.delete")} ${name}` : undefined}
        onClick={() => setOpen(true)}
      >
        {t("actions.delete")}
      </Button>
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
    </>
  );
}
