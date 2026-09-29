import type { ReactNode } from "react";

import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    // Full-height column: short pages still put the footer at the bottom.
    <div className="pb-page">
      <SiteHeader />
      <main className="pb-wrap pb-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
