"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";
import { useToast } from "@/components/admin/toast";
import { inputCls, labelCls } from "@/components/admin/ui";
import { cancelBooking } from "../actions";

/** "Cancel booking" and its confirmation; cancelling frees the dates. */
export function CancelBooking({ id, reference }: { id: string; reference: string }) {
  const t = useTranslations("admin.bookings");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const r = await cancelBooking(id, reason);
      if (r.error) return setError(r.error);
      setOpen(false);
      toast(t("cancelled", { ref: reference }));
      router.refresh();
    });

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t("cancel")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        title={t("cancelTitle", { ref: reference })}
        actions={
          <>
            <Button data-autofocus onClick={() => setOpen(false)} disabled={busy}>
              {t("keep")}
            </Button>
            <Button variant="danger" onClick={confirm} disabled={busy}>
              {t("cancel")}
            </Button>
          </>
        }
      >
        <p>{t("cancelBody")}</p>
        <label className="mt-3 block">
          <span className={labelCls}>{t("reason")}</span>
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </label>
        {error && <p className="mt-2 text-danger">{error}</p>}
      </Modal>
    </>
  );
}
