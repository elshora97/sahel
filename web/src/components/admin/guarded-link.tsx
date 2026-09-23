"use client";

import type { ComponentProps, MouseEvent } from "react";

import { Link, useRouter } from "@/i18n/navigation";
import { needsLeavePrompt } from "@/lib/admin/unsaved";
import { useUnsavedChanges } from "./unsaved-changes";

/** What next-intl's router can push: a path, or a path with a query. */
type Href = Parameters<ReturnType<typeof useRouter>["push"]>[0];

/** A locale-aware Link that asks before leaving a form with unsaved changes. */
export function GuardedLink({ onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: Href }) {
  const guard = useUnsavedChanges();
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    const plainClick = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && props.target !== "_blank";
    if (e.defaultPrevented || !plainClick) return;
    const target = typeof props.href === "string" ? props.href : props.href.pathname;
    if (!needsLeavePrompt(guard.dirty, target)) return;
    e.preventDefault();
    guard.confirmLeave(() => router.push(props.href, { locale: props.locale }));
  }

  return <Link {...props} onClick={handleClick} />;
}
