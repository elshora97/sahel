"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useState, type ReactNode } from "react";

import type { FormAction } from "@/lib/admin/types";
import { DeleteDialog } from "./confirm-delete";
import { ErrorBanner } from "./entity-form";

const ReportError = createContext<(message: string) => void>(() => {});

/** Wraps a list so a failed row delete shows one "Can't delete" banner above it. */
export function ListErrors({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const [error, setError] = useState<string | null>(null);
  return (
    <ReportError.Provider value={setError}>
      {error && (
        <div className="mb-4">
          <ErrorBanner title={t("feedback.cantDelete")} message={error} />
        </div>
      )}
      {children}
    </ReportError.Provider>
  );
}

/** The Delete button for a table row or grid card. */
export function RowDelete({ action, name, detail }: { action: FormAction; name: string; detail: string }) {
  const report = useContext(ReportError);
  return <DeleteDialog action={action} name={name} detail={detail} compact onError={report} />;
}
