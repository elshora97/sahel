/* eslint-disable @next/next/no-img-element -- admin thumbnails straight from MinIO */
import { getTranslations } from "next-intl/server";

import { DataTable, cellCls, rowCls } from "@/components/ds/data-table";
import { StateBadge } from "@/components/ds/state-badge";
import { formatWhen, other, pick, unitStatusTone } from "@/lib/admin/labels";
import type { UnitRow } from "@/lib/admin/types";
import { deleteUnit } from "@/app/[locale]/dashboard/units/actions";
import { RowDelete } from "./row-delete";
import { RowLink } from "./row-link";

/** `back` (the list's query string) turns on the per-row Delete; the overview leaves it off. */
export async function UnitsTable({ rows, locale, back }: { rows: UnitRow[]; locale: string; back?: string }) {
  const t = await getTranslations();
  return (
    <DataTable
      head={[
        <span key="c" className="sr-only">{t("admin.units.cover")}</span>,
        t("admin.units.titleCol"),
        t("admin.units.compound"),
        t("admin.units.type"),
        t("admin.units.status"),
        t("admin.units.edited"),
        ...(back !== undefined ? [<span key="actions" className="sr-only">{t("admin.list.actions")}</span>] : []),
      ]}
    >
      {rows.map((u) => (
        <tr key={u.id} className={rowCls}>
          <td className={`${cellCls} w-[72px]`}>
            {u.cover_url ? (
              <img src={u.cover_url} alt="" className="h-10 w-14 rounded-sm object-cover" />
            ) : (
              <span className="block h-10 w-14 rounded-sm bg-sand" />
            )}
          </td>
          <td className={cellCls}>
            <RowLink href={`/dashboard/units/${u.id}`} primary={pick(locale, u.title_ar, u.title_en)} secondary={other(locale, u.title_ar, u.title_en)} />
          </td>
          <td className={cellCls}>{pick(locale, u.compound_name_ar, u.compound_name_en)}</td>
          <td className={cellCls}>{t(`enums.type.${u.type}`)}</td>
          <td className={cellCls}>
            <StateBadge tone={unitStatusTone(u.status)}>{t(`enums.unit_status.${u.status}`)}</StateBadge>
          </td>
          <td className={`${cellCls} num whitespace-nowrap text-ink-muted`}>{formatWhen(u.updated_at, locale)}</td>
          {back !== undefined && (
            <td className={`${cellCls} w-px text-end`}>
              <RowDelete
                action={deleteUnit.bind(null, u.id, locale, pick(locale, u.title_ar, u.title_en), back)}
                name={pick(locale, u.title_ar, u.title_en)}
                detail={t("admin.confirm.unit")}
              />
            </td>
          )}
        </tr>
      ))}
    </DataTable>
  );
}
