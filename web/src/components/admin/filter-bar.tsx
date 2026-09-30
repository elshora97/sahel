"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ds/button";
import type { Option } from "./fields";
import { inputCls } from "./ui";
import { startNavProgress } from "@/components/ds/nav-progress";

/** Spec §6.3: search (debounced) and selects write to the query string; the page filters on the server. */
export function FilterBar({
  placeholder,
  selects = [],
  dates = [],
}: {
  placeholder: string;
  selects?: Array<{ name: string; label: string; options: Option[] }>;
  /** Date fields (YYYY-MM-DD in the query), shown after the selects. */
  dates?: Array<{ name: string; label: string }>;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const apply = useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      if (query !== params.toString()) startNavProgress();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (q.trim() === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => apply({ q: q.trim() }), 300);
    return () => clearTimeout(timer);
  }, [q, params, apply]);

  const active = params.has("q") || [...selects, ...dates].some((s) => params.has(s.name));

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: q.trim() });
      }}
      className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={t("list.search")}
        className={`${inputCls} sm:min-w-0 sm:flex-[2]`}
      />
      {selects.map((s) => (
        <select
          key={s.name}
          aria-label={s.label}
          value={params.get(s.name) ?? ""}
          onChange={(e) => apply({ [s.name]: e.target.value })}
          className={`${inputCls} truncate sm:min-w-0 sm:max-w-56 sm:flex-1`}
        >
          <option value="">
            {s.label}: {t("list.all")}
          </option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {dates.map((d) => (
        <label key={d.name} className="flex items-center gap-2 sm:shrink-0">
          <span className="w-16 shrink-0 text-sm text-ink-muted sm:w-auto">{d.label}</span>
          <input
            type="date"
            value={params.get(d.name) ?? ""}
            onChange={(e) => apply({ [d.name]: e.target.value })}
            className={`${inputCls} num min-w-0 sm:w-40`}
            dir="ltr"
          />
        </label>
      ))}
      {active && (
        <Button
          variant="quiet"
          className="self-start sm:shrink-0"
          onClick={() => {
            setQ("");
            startNavProgress();
            router.replace(pathname, { scroll: false });
          }}
        >
          {t("actions.clear")}
        </Button>
      )}
    </form>
  );
}
