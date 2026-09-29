import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/data-table";
import { StatTile } from "@/components/ds/stat-tile";
import { StateBadge } from "@/components/ds/state-badge";
import { GuardedLink } from "@/components/admin/guarded-link";
import { PageHeader } from "@/components/admin/page-header";
import { RowLink } from "@/components/admin/row-link";
import { UnitsTable } from "@/components/admin/units-table";
import { adminGet } from "@/lib/admin/api";
import { pick } from "@/lib/admin/labels";
import type { CompoundRow, Owner, UnitRow } from "@/lib/admin/types";

export default async function OverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, compounds, owners, units, pay] = await Promise.all([
    getTranslations("admin"),
    adminGet<CompoundRow[]>("/compounds"),
    adminGet<Owner[]>("/owners"),
    adminGet<UnitRow[]>("/units"), // newest edit first
    adminGet<{ pending: number }>("/payments/pending-count").catch(() => ({ pending: 0 })),
  ]);

  const active = units.filter((u) => u.status === "active").length;
  const drafts = units.filter((u) => u.status === "draft").length;
  const attention = units
    .filter((u) => u.status === "draft" || !u.cover_url)
    .slice(0, 8)
    .map((u) => ({
      unit: u,
      reasons: [
        u.status === "draft" && { tone: "neutral" as const, label: t("overview.reasonDraft") },
        !u.cover_url && { tone: "attention" as const, label: t("overview.reasonNoCover") },
      ].filter((r) => r !== false),
    }));

  return (
    <>
      <PageHeader title={t("overview.heading")} />
      {pay.pending > 0 && (
        <GuardedLink href="/dashboard/payments" className="mb-6 flex items-center gap-4 rounded-lg border border-sun bg-sun-soft px-5 py-4 text-ink shadow-card hover:bg-sun-soft/70">
          <span className="num grid size-11 place-items-center rounded-full bg-sun text-lg font-bold">{pay.pending}</span>
          <span>
            <strong className="block">{t("payments.toCheck", { count: pay.pending })}</strong>
            <span className="text-sm text-ink-muted">{t("payments.toCheckHint")}</span>
          </span>
        </GuardedLink>
      )}
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label={t("overview.statActive")}
            value={active}
            note={t("overview.noteActive", { total: units.length })}
            href={{ pathname: "/dashboard/units", query: { status: "active" } }}
          />
          <StatTile
            label={t("overview.statDrafts")}
            value={drafts}
            note={t("overview.noteDrafts")}
            href={{ pathname: "/dashboard/units", query: { status: "draft" } }}
          />
          <StatTile label={t("overview.statCompounds")} value={compounds.length} href="/dashboard/compounds" />
          <StatTile label={t("overview.statOwners")} value={owners.length} href="/dashboard/owners" />
        </div>

        {attention.length > 0 && (
          <Card title={t("overview.attention")} padded={false}>
            <ul>
              {attention.map(({ unit, reasons }) => (
                <li key={unit.id} className="relative flex flex-wrap items-center gap-3 border-t border-line px-6 py-3 first:border-t-0 hover:bg-sea-soft/60 focus-within:bg-sea-soft">
                  <RowLink
                    href={`/dashboard/units/${unit.id}`}
                    primary={pick(locale, unit.title_ar, unit.title_en)}
                    secondary={pick(locale, unit.compound_name_ar, unit.compound_name_en)}
                  />
                  <span className="ms-auto flex gap-2">
                    {reasons.map((r) => (
                      <StateBadge key={r.label} tone={r.tone}>
                        {r.label}
                      </StateBadge>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title={t("overview.recent")} padded={false}>
          {units.length === 0 ? (
            <EmptyState>
              <p>{t("overview.empty")}</p>
              <GuardedLink href="/dashboard/units/new" className={buttonClass("primary")}>
                {t("overview.createFirst")}
              </GuardedLink>
            </EmptyState>
          ) : (
            <UnitsTable rows={units.slice(0, 8)} locale={locale} />
          )}
        </Card>
      </div>
    </>
  );
}
