"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";
import { useToast } from "@/components/admin/toast";
import { hintCls, inputCls, labelCls } from "@/components/admin/ui";
import { setGuestPassword } from "../actions";

/** Sets a new password for the booking's guest, to be told to them by phone. */
export function GuestPassword({ customerId, name }: { customerId: string; name: string }) {
  const t = useTranslations("admin.bookings");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const save = () =>
    start(async () => {
      if (password.length < 8) return setError(t("passwordRule"));
      const r = await setGuestPassword(customerId, password);
      if (r.error) return setError(r.error);
      setOpen(false);
      setPassword("");
      setError(null);
      toast(t("passwordSet", { name }));
    });

  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
        {t("setPassword")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        title={t("setPasswordTitle", { name })}
        actions={
          <>
            <Button data-autofocus onClick={() => setOpen(false)} disabled={busy}>
              {t("keep")}
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {t("setPassword")}
            </Button>
          </>
        }
      >
        <p>{t("setPasswordBody")}</p>
        <label className="mt-3 block">
          <span className={labelCls}>{t("newPassword")}</span>
          <input className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} dir="ltr" autoComplete="off" />
          <span className={hintCls}>{t("passwordRule")}</span>
        </label>
        {error && <p className="mt-2 text-danger">{error}</p>}
      </Modal>
    </>
  );
}
