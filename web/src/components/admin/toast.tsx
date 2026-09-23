"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

/** Small, self-dismissing notes for inline edits (spec §6.2). Record-level results use the modal. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const show = useCallback((text: string) => setToast({ text, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed end-6 bottom-6 z-50">
        {toast && (
          <div key={toast.id} className="rounded-md border border-line bg-surface px-4 py-3 text-sm shadow-sheet">
            {toast.text}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
