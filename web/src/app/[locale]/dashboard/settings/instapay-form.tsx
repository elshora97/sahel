"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { useToast } from "@/components/admin/toast";
import { hintCls, inputCls, labelCls } from "@/components/admin/ui";
import type { InstapayAccount } from "@/lib/admin/types";
import { saveInstapay } from "../payments/actions";

/** Where guests send the deposit; shown on every unpaid booking page. */
export function InstapayForm({ account }: { account: InstapayAccount }) {
  const t = useTranslations("admin.settings");
  const router = useRouter();
  const toast = useToast();
  const [address, setAddress] = useState(account.address);
  const [mobile, setMobile] = useState(account.mobile);
  const [holder, setHolder] = useState(account.holder_name);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveInstapay(address, mobile, holder);
      if (r.error) return setError(r.error);
      setError(null);
      toast(t("saved"));
      router.refresh();
    });

  return (
    <Card title={t("instapay")}>
      <p className="mb-4 text-sm text-ink-muted">{t("instapayHint")}</p>
      <form
        className="grid max-w-xl gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          <span className={labelCls}>{t("address")}</span>
          <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} dir="ltr" placeholder="beetelsahel@instapay" />
          <span className={hintCls}>{t("addressHint")}</span>
        </label>
        <label>
          <span className={labelCls}>{t("mobile")}</span>
          <input className={`${inputCls} num`} value={mobile} onChange={(e) => setMobile(e.target.value)} dir="ltr" inputMode="tel" placeholder="010 1234 5678" />
        </label>
        <label>
          <span className={labelCls}>{t("holder")}</span>
          <input className={inputCls} value={holder} onChange={(e) => setHolder(e.target.value)} />
          <span className={hintCls}>{t("holderHint")}</span>
        </label>
        {error && <p className="text-danger">{error}</p>}
        <div>
          <Button variant="primary" type="submit" disabled={busy}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
