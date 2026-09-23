"use client";

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";

type Guard = {
  dirty: boolean;
  setDirty: (formId: string, dirty: boolean) => void;
  /** Runs `go` now, or after the admin confirms discarding their edits. */
  confirmLeave: (go: () => void) => void;
};

const GuardContext = createContext<Guard>({ dirty: false, setDirty: () => {}, confirmLeave: (go) => go() });
export const useUnsavedChanges = () => useContext(GuardContext);

/**
 * Spec §6.1: in-app navigation away from a dirty form asks through our
 * modal. Closing or refreshing the tab can only use the browser's own
 * beforeunload prompt, which is all that is attached for that case.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const [dirtyForms, setDirtyForms] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const leaving = useRef(false);
  const dirty = dirtyForms.size > 0;

  const setDirty = useCallback((formId: string, value: boolean) => {
    setDirtyForms((prev) => {
      if (prev.has(formId) === value) return prev;
      const next = new Set(prev);
      if (value) next.add(formId);
      else next.delete(formId);
      return next;
    });
  }, []);

  const confirmLeave = useCallback(
    (go: () => void) => {
      if (!dirty) return go();
      pending.current = go;
      setAsking(true);
    },
    [dirty],
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Back/forward: while dirty, park a duplicate entry of this page. Popping
  // it means the admin pressed Back; re-park it and ask first.
  useEffect(() => {
    if (!dirty) return;
    leaving.current = false;
    window.history.pushState(window.history.state, "", window.location.href);
    const onPopState = () => {
      if (leaving.current) return;
      window.history.pushState(window.history.state, "", window.location.href);
      pending.current = () => window.history.go(-2);
      setAsking(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dirty]);

  const stay = () => {
    pending.current = null;
    setAsking(false);
  };
  const leave = () => {
    const go = pending.current;
    pending.current = null;
    leaving.current = true;
    setAsking(false);
    setDirtyForms(new Set());
    go?.();
  };

  const value = useMemo(() => ({ dirty, setDirty, confirmLeave }), [dirty, setDirty, confirmLeave]);

  return (
    <GuardContext.Provider value={value}>
      {children}
      <Modal
        open={asking}
        onClose={stay}
        title={t("feedback.unsavedTitle")}
        actions={
          <>
            <Button variant="secondary" data-autofocus onClick={stay}>
              {t("actions.keepEditing")}
            </Button>
            <Button variant="danger" onClick={leave}>
              {t("actions.discard")}
            </Button>
          </>
        }
      >
        <p>{t("feedback.unsavedBody")}</p>
      </Modal>
    </GuardContext.Provider>
  );
}
