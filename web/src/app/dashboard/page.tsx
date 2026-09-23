import Link from "next/link";

import { EmptyState } from "@/components/admin/page-header";
import { linkCls } from "@/components/admin/ui";
import { UnitsTable } from "@/components/admin/units-table";
import { adminGet } from "@/lib/admin/api";
import type { Area, CompoundRow, Owner, UnitRow } from "@/lib/admin/types";

export default async function DashboardHome() {
  const [areas, compounds, owners, units] = await Promise.all([
    adminGet<Area[]>("/areas"),
    adminGet<CompoundRow[]>("/compounds"),
    adminGet<Owner[]>("/owners"),
    adminGet<UnitRow[]>("/units"), // newest edit first
  ]);

  const counts = [
    ["Areas", areas.length, "/dashboard/areas"],
    ["Compounds", compounds.length, "/dashboard/compounds"],
    ["Owners", owners.length, "/dashboard/owners"],
    ["Units", units.length, "/dashboard/units"],
  ] as const;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {counts.map(([label, n, href]) => (
          <Link key={href} href={href} className="rounded-lg border border-border bg-white p-4 hover:border-sea">
            <div className="text-3xl font-semibold tabular-nums">{n}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
          </Link>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recently edited units</h2>
        {units.length === 0 ? (
          <EmptyState>
            No units yet.{" "}
            <Link href="/dashboard/units/new" className={linkCls}>
              Create the first one
            </Link>
            .
          </EmptyState>
        ) : (
          <UnitsTable rows={units.slice(0, 8)} />
        )}
      </section>
    </div>
  );
}
