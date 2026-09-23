/* eslint-disable @next/next/no-img-element -- admin thumbnails straight from MinIO; no optimisation needed */
import Link from "next/link";

import type { UnitRow } from "@/lib/admin/types";
import { linkCls, tableCls } from "./ui";

const statusStyle: Record<string, string> = {
  active: "bg-lagoon/50",
  draft: "bg-sand",
  paused: "bg-sun/40",
  archived: "bg-state-blocked/60",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${statusStyle[status] ?? "bg-sand"}`}>{status}</span>;
}

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  });
}

export function UnitsTable({ rows }: { rows: UnitRow[] }) {
  return (
    <table className={tableCls}>
      <thead>
        <tr>
          <th className="w-16" />
          <th>Title</th>
          <th>Compound</th>
          <th>Type</th>
          <th>Beds</th>
          <th>Status</th>
          <th>Edited</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id}>
            <td>
              {u.cover_url ? (
                <img src={u.cover_url} alt="" className="h-10 w-14 rounded object-cover" />
              ) : (
                <div className="h-10 w-14 rounded bg-sand" />
              )}
            </td>
            <td>
              <Link href={`/dashboard/units/${u.id}`} className={linkCls}>
                {u.title_en}
              </Link>
              <div className="text-xs text-muted-foreground" dir="rtl">
                {u.title_ar}
              </div>
            </td>
            <td>{u.compound_name_en}</td>
            <td>{u.type}</td>
            <td>{u.bedrooms}</td>
            <td>
              <StatusBadge status={u.status} />
            </td>
            <td className="whitespace-nowrap text-muted-foreground">{formatWhen(u.updated_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
