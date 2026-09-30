import { FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/data-table";
import { StateBadge } from "@/components/ds/state-badge";
import { GuardedLink } from "@/components/admin/guarded-link";
import { PageHeader } from "@/components/admin/page-header";
import { PaymentActions } from "@/components/admin/payment-actions";
import { linkCls } from "@/components/admin/ui";
import { adminGet } from "@/lib/admin/api";
import { param, type SearchParams } from "@/lib/admin/filter";
import { formatWhen, pick, type Tone } from "@/lib/admin/labels";
import type { PaymentRow } from "@/lib/admin/types";
import { formatPhone } from "@/lib/public/phone";
import { cn, formatEGP } from "@/lib/utils";

const TABS = ["pending", "verified", "rejected"] as const;
const tone: Record<PaymentRow["status"], Tone> = { pending: "held", verified: "confirmed", rejected: "danger" };

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const status = (TABS as readonly string[]).includes(param(sp, "status")) ? param(sp, "status") : "pending";
  const [t, rows] = await Promise.all([getTranslations("admin.payments"), adminGet<PaymentRow[]>(`/payments?status=${status}`)]);
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d));

  return (
    <>
      <PageHeader title={t("heading")} subtitle={t("subtitle")} />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label={t("heading")}>
        {TABS.map((s) => (
          <GuardedLink
            key={s}
            href={s === "pending" ? "/dashboard/payments" : `/dashboard/payments?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={cn("rounded-full px-4 py-2 text-sm font-medium", s === status ? "bg-sea-deep text-surface" : "bg-sea-soft text-sea-deep hover:bg-sea-soft/70")}
          >
            {t(`tab.${s}`)}
          </GuardedLink>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <EmptyState>{t(`empty.${status as "pending"}`)}</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rows.map((p) => {
            const proof = `/${locale}/dashboard/payments/${p.id}/proof`;
            const due = Math.max(p.deposit_due - p.paid_total, 0);
            return (
              <Card key={p.id}>
                <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                  {p.has_proof ? (
                    <a href={proof} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line bg-shell" aria-label={t("openReceipt")}>
                      {p.proof_type === "application/pdf" ? (
                        <span className="flex aspect-[3/4] flex-col items-center justify-center gap-2 text-sea-deep">
                          <FileText size={36} aria-hidden="true" />
                          PDF
                        </span>
                      ) : (
                        <img src={proof} alt={t("receiptAlt", { ref: p.ref })} className="aspect-[3/4] w-full object-cover" />
                      )}
                    </a>
                  ) : (
                    <span className="flex aspect-[3/4] items-center justify-center rounded-md bg-shell p-3 text-center text-sm text-ink-muted">{t("noReceipt")}</span>
                  )}
                  <div className="grid content-start gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <GuardedLink href={`/dashboard/bookings/${p.booking_id}`} className={`${linkCls} num text-lg`} dir="ltr">
                        {p.ref}
                      </GuardedLink>
                      <StateBadge tone={tone[p.status]}>{t(`status.${p.status}`)}</StateBadge>
                      <span className="text-sm text-ink-muted">{formatWhen(p.created_at, locale)}</span>
                    </div>
                    <dl className="grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2">
                      <div>
                        <dt className="text-sm text-ink-muted">{t("guest")}</dt>
                        <dd className="m-0">
                          {p.customer_name} · <span dir="ltr" className="num">{formatPhone(p.customer_phone)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-ink-muted">{t("stay")}</dt>
                        <dd className="num m-0">
                          {pick(locale, p.unit_title_ar, p.unit_title_en)} · {fmt(p.check_in)} – {fmt(p.check_out)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-ink-muted">{t("sentBy")}</dt>
                        <dd className="m-0">
                          {p.sender_name || "—"} {p.sender_number && <span dir="ltr" className="num">· {p.sender_number}</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-ink-muted">{t("amounts")}</dt>
                        <dd className="num m-0 font-medium">
                          {t("statedVsDue", { stated: formatEGP(p.amount, locale), due: formatEGP(p.deposit_due, locale) })}
                        </dd>
                      </div>
                    </dl>
                    {p.rejection_reason && <p className="m-0 text-sm text-danger">{t("rejectedBecause", { reason: p.rejection_reason })}</p>}
                    {p.status === "pending" && <PaymentActions paymentId={p.id} suggested={due || p.amount} reference={p.ref} />}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
