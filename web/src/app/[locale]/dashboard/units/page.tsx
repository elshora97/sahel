import { getTranslations } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { GuardedLink } from "@/components/admin/guarded-link";
import { ListCount } from "@/components/admin/list-count";
import { PageHeader } from "@/components/admin/page-header";
import { UnitsTable } from "@/components/admin/units-table";
import { adminGet } from "@/lib/admin/api";
import { filterUnits, hasFilters, unitFilters, type SearchParams } from "@/lib/admin/filter";
import { enumOptions, pick } from "@/lib/admin/labels";
import type { CompoundRow, Enums, UnitRow } from "@/lib/admin/types";

export default async function UnitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const [t, all, compounds, enums] = await Promise.all([
    getTranslations(),
    adminGet<UnitRow[]>("/units"),
    adminGet<CompoundRow[]>("/compounds"),
    adminGet<Enums>("/enums"),
  ]);
  const filters = unitFilters(sp);
  const rows = filterUnits(all, filters);

  return (
    <>
      <PageHeader
        title={t("admin.units.heading")}
        subtitle={<ListCount total={all.length} shown={rows.length} filtered={hasFilters({ ...filters })} />}
        actions={
          <GuardedLink href="/dashboard/units/new" className={buttonClass("primary")}>
            {t("admin.units.new")}
          </GuardedLink>
        }
      />
      <FilterBar
        placeholder={t("admin.units.search")}
        selects={[
          {
            name: "status",
            label: t("admin.units.filterStatus"),
            options: enumOptions(enums.unit_status, (v) => t(`enums.unit_status.${v}`)),
          },
          {
            name: "compound",
            label: t("admin.units.filterCompound"),
            options: compounds.map((c) => ({ value: c.id, label: pick(locale, c.name_ar, c.name_en) })),
          },
          {
            name: "type",
            label: t("admin.units.filterType"),
            options: enumOptions(enums.type, (v) => t(`enums.type.${v}`)),
          },
        ]}
      />
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState>{all.length === 0 ? t("admin.units.empty") : t("admin.list.noResults")}</EmptyState>
        ) : (
          <UnitsTable rows={rows} locale={locale} />
        )}
      </Card>
    </>
  );
}
