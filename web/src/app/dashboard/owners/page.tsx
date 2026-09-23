import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { linkCls, tableCls } from "@/components/admin/ui";
import { adminGet } from "@/lib/admin/api";
import type { Owner } from "@/lib/admin/types";

export default async function OwnersPage() {
  const owners = await adminGet<Owner[]>("/owners");
  return (
    <>
      <PageHeader title="Owners" newHref="/dashboard/owners/new" />
      {owners.length === 0 ? (
        <EmptyState>No owners yet.</EmptyState>
      ) : (
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Commission</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/dashboard/owners/${o.id}`} className={linkCls}>
                    {o.name}
                  </Link>
                </td>
                <td dir="ltr">{o.phone}</td>
                <td>{o.email ?? "—"}</td>
                <td>{o.commission_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
