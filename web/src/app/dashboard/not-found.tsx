import Link from "next/link";

import { linkCls } from "@/components/admin/ui";

export default function DashboardNotFound() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">That record doesn&apos;t exist, or it was deleted.</p>
      <Link href="/dashboard" className={linkCls}>
        Back to the dashboard
      </Link>
    </div>
  );
}
