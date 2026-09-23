import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { linkCls, tableCls } from "@/components/admin/ui";
import { adminGet } from "@/lib/admin/api";
import type { Area } from "@/lib/admin/types";

export default async function AreasPage() {
  const areas = await adminGet<Area[]>("/areas");
  return (
    <>
      <PageHeader title="Areas" newHref="/dashboard/areas/new" />
      {areas.length === 0 ? (
        <EmptyState>No areas yet.</EmptyState>
      ) : (
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>الاسم</th>
              <th>Region</th>
              <th>Km</th>
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/dashboard/areas/${a.id}`} className={linkCls}>
                    {a.name_en}
                  </Link>
                </td>
                <td dir="rtl">{a.name_ar}</td>
                <td>{a.region}</td>
                <td>{a.km_marker ?? "—"}</td>
                <td>{a.sort_order}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
