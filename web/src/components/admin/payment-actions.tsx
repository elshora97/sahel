"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";
import { useToast } from "@/components/admin/toast";
import { hintCls, inputCls, labelCls } from "@/components/admin/ui";
import { toPiasters } from "@/lib/public/calendar";
import { recordPayment, rejectPayment, verifyPayment } from "@/app/[locale]/dashboard/payments/actions";

type Mode = "verify" | "reject" | null;

/** Verify (with the amount actually received) or reject (with a reason) one receipt. */
export function PaymentActions({ paymentId, suggested, reference }: { paymentId: string; suggested: number; reference: string }) {
  const t = useTranslations("admin.payments");
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState(String(suggested / 100));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const close = () => {
    setMode(null);
    setError(null);
  };
  const run = () =>
    start(async () => {
      let r: { error?: string };
      if (mode === "verify") {
        const p = toPiasters(amount);
        if (!p) return setError(t("amountInvalid"));
        r = await verifyPayment(paymentId, p);
      } else {
        if (!reason.trim()) return setError(t("reasonRequired"));
        r = await rejectPayment(paymentId, reason);
      }
      if (r.error) return setError(r.error);
      toast(mode === "verify" ? t("verified", { ref: reference }) : t("rejected", { ref: reference }));
      close();
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => setMode("verify")}>
        {t("verify")}
      </Button>
      <Button variant="danger" size="sm" onClick={() => setMode("reject")}>
        {t("reject")}
      </Button>
      <Modal
        open={mode !== null}
        onClose={close}
        busy={busy}
        title={mode === "verify" ? t("verifyTitle", { ref: reference }) : t("rejectTitle", { ref: reference })}
        actions={
          <>
            <Button data-autofocus onClick={close} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button variant={mode === "verify" ? "primary" : "danger"} onClick={run} disabled={busy}>
              {mode === "verify" ? t("verify") : t("reject")}
            </Button>
          </>
        }
      >
        {mode === "verify" ? (
          <label className="block">
            <span className={labelCls}>{t("amountReceived")}</span>
            <input className={`${inputCls} num`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" />
            <span className={hintCls}>{t("amountHint")}</span>
          </label>
        ) : (
          <label className="block">
            <span className={labelCls}>{t("reason")}</span>
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            <span className={hintCls}>{t("reasonHint")}</span>
          </label>
        )}
        {error && <p className="mt-2 text-danger">{error}</p>}
      </Modal>
    </div>
  );
}

/** Records money that arrived without an uploaded receipt (the guest called). */
export function RecordPayment({ bookingId, suggested }: { bookingId: string; suggested: number }) {
  const t = useTranslations("admin.payments");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(suggested / 100));
  const [sender, setSender] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const save = () =>
    start(async () => {
      const p = toPiasters(amount);
      if (!p) return setError(t("amountInvalid"));
      const r = await recordPayment(bookingId, p, sender, notes);
      if (r.error) return setError(r.error);
      setOpen(false);
      setError(null);
      toast(t("recorded"));
      router.refresh();
    });

  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
        {t("record")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        title={t("recordTitle")}
        actions={
          <>
            <Button data-autofocus onClick={() => setOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {t("record")}
            </Button>
          </>
        }
      >
        <p>{t("recordBody")}</p>
        <div className="mt-3 grid gap-3">
          <label>
            <span className={labelCls}>{t("amountReceived")}</span>
            <input className={`${inputCls} num`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" />
          </label>
          <label>
            <span className={labelCls}>{t("sender")}</span>
            <input className={inputCls} value={sender} onChange={(e) => setSender(e.target.value)} maxLength={120} />
          </label>
          <label>
            <span className={labelCls}>{t("notes")}</span>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
          </label>
        </div>
        {error && <p className="mt-2 text-danger">{error}</p>}
      </Modal>
    </>
  );
}
