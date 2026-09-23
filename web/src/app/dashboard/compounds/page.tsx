import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { linkCls, tableCls } from "@/components/admin/ui";
import { adminGet } from "@/lib/admin/api";
import type { CompoundRow } from "@/lib/admin/types";

export default async function CompoundsPage() {
  const compounds = await adminGet<CompoundRow[]>("/compounds");
  return (
    <>
      <PageHeader title="Compounds" newHref="/dashboard/compounds/new" />
      {compounds.length === 0 ? (
        <EmptyState>No compounds yet. Create an area first.</EmptyState>
      ) : (
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>الاسم</th>
              <th>Area</th>
              <th>Beach</th>
              <th>Featured</th>
            </tr>
          </thead>
          <tbody>
            {compounds.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/dashboard/compounds/${c.id}`} className={linkCls}>
                    {c.name_en}
                  </Link>
                </td>
                <td dir="rtl">{c.name_ar}</td>
                <td>{c.area_name_en}</td>
                <td>{c.beach_type}</td>
                <td>{c.is_featured ? "★" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
