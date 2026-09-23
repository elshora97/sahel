import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";

import { ActionResultModal } from "@/components/admin/action-result-modal";
import { Sidebar } from "@/components/admin/sidebar";
import { ToastProvider } from "@/components/admin/toast";
import { UnsavedChangesProvider } from "@/components/admin/unsaved-changes";

// Every admin page reads live data.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.shell");
  return { title: `${t("subtitle")} · ${t("brand")}`, robots: { index: false, follow: false } };
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <UnsavedChangesProvider>
      <ToastProvider>
        <div className="min-h-dvh bg-shell text-ink lg:flex">
          <Suspense>
            <Sidebar />
          </Suspense>
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-10 sm:py-8">{children}</main>
        </div>
        <Suspense>
          <ActionResultModal />
        </Suspense>
      </ToastProvider>
    </UnsavedChangesProvider>
  );
}
