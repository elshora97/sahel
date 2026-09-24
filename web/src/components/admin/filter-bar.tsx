"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ds/button";
import type { Option } from "./fields";
import { inputCls } from "./ui";

/** Spec §6.3: search (debounced) and selects write to the query string; the page filters on the server. */
export function FilterBar({
  placeholder,
  selects = [],
}: {
  placeholder: string;
  selects?: Array<{ name: string; label: string; options: Option[] }>;
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
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (q.trim() === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => apply({ q: q.trim() }), 300);
    return () => clearTimeout(timer);
  }, [q, params, apply]);

  const active = params.has("q") || selects.some((s) => params.has(s.name));

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
      {active && (
        <Button
          variant="quiet"
          className="self-start sm:shrink-0"
          onClick={() => {
            setQ("");
            router.replace(pathname, { scroll: false });
          }}
        >
          {t("actions.clear")}
        </Button>
      )}
    </form>
  );
}
