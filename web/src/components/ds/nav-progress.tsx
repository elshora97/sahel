"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const START = "navprogress:start";
const STOP = "navprogress:stop";

/** Starts the top loading bar for a navigation that isn't a link click (router.push/replace). */
export function startNavProgress() {
  window.dispatchEvent(new Event(START));
}

/** Stops the bar when a started navigation is called off (an unsaved-changes prompt). */
export function stopNavProgress() {
  window.dispatchEvent(new Event(STOP));
}

/**
 * A thin bar across the top of the screen from the moment a navigation starts
 * until the new route renders. Link clicks and GET form submits start it on
 * their own; code that navigates with the router calls startNavProgress().
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const safety = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const start = () => {
      setState("loading");
      clearTimeout(safety.current);
      // A navigation that never lands (an error, a cancelled prompt) still ends.
      safety.current = setTimeout(() => setState("done"), 15000);
    };
    const stop = () => setState((s) => (s === "loading" ? "idle" : s));
    // Capture phase: next/link prevents default on every client navigation.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (!e.defaultPrevented && form.method === "get") start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    window.addEventListener(START, start);
    window.addEventListener(STOP, stop);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener(START, start);
      window.removeEventListener(STOP, stop);
    };
  }, []);

  // The new route rendered: fill the bar, then fade it out.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
  }, [pathname, search]);

  useEffect(() => {
    if (state !== "done") return;
    clearTimeout(safety.current);
    const t = setTimeout(() => setState("idle"), 400);
    return () => clearTimeout(t);
  }, [state]);

  // Visual only: screen readers get aria-busy from each route's loading screen.
  return <div className="nav-progress" data-state={state} aria-hidden="true" />;
}
