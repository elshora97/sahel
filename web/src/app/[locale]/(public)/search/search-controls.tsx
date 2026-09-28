"use client";

import { Minus, Plus, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";

import { buttonClass } from "@/components/ds/button";
import { useRouter } from "@/i18n/navigation";
import { pick } from "@/lib/admin/labels";
import { SEA_DISTANCES, SORTS, UNIT_TYPES, UNIT_VIEWS, activeFilterCount, filtersToQuery, type Filters } from "@/lib/public/search-params";
import type { AreaSummary, CompoundSummary } from "@/lib/public/types";

type Option = { value: string; label: string };

/**
 * Filters on the start side, results on the end. Every change rewrites the
 * URL (page back to 1) and the server re-renders; results dim while it does.
 */
export function SearchControls({
  filters,
  areas,
  compounds,
  count,
  children,
}: {
  filters: Filters;
  areas: AreaSummary[];
  compounds: CompoundSummary[];
  count: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("public");
  const enums = useTranslations("enums");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Phones only: the panel folds away so results come first.
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(filters);

  const apply = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch, page: 1 };
    const query = filtersToQuery(next);
    startTransition(() => router.replace(query ? `/search?${query}` : "/search", { scroll: false }));
  };

  const areaCompounds = filters.area ? compounds.filter((c) => c.area_slug === filters.area) : compounds;
  const chips = (name: "type" | "view", values: readonly string[], anyLabel: string) => {
    const options: Option[] = [{ value: "", label: anyLabel }, ...values.map((v) => ({ value: v, label: enums(`${name}.${v}`) }))];
    return (
      <div className="pb-chips">
        {options.map((o) => (
          <label key={o.value || "any"} className="pb-chip">
            <input type="radio" name={name} value={o.value} checked={filters[name] === o.value} onChange={() => apply({ [name]: o.value })} />
            {o.label}
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className="pb-search-layout">
      <button
        type="button"
        className={`${buttonClass("secondary")} pb-filters-toggle`}
        aria-expanded={open}
        aria-controls="search-filters"
        onClick={() => setOpen((o) => !o)}
        style={{ justifySelf: "start" }}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        {t("filters.title")}
        {active > 0 && <span className="num">({active})</span>}
      </button>
      <aside className="pb-filters" id="search-filters" data-open={open} aria-label={t("filters.title")}>
        <label>
          <span className="pb-label">{t("filters.area")}</span>
          <select className="pb-select" value={filters.area} onChange={(e) => apply({ area: e.target.value, compound: "" })}>
            <option value="">{t("filters.anyArea")}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.slug}>
                {pick(locale, a.name_ar, a.name_en)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="pb-label">{t("filters.compound")}</span>
          <select className="pb-select" value={filters.compound} onChange={(e) => apply({ compound: e.target.value })}>
            <option value="">{t("filters.anyCompound")}</option>
            {areaCompounds.map((c) => (
              <option key={c.id} value={c.slug}>
                {pick(locale, c.name_ar, c.name_en)}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{t("filters.type")}</legend>
          {chips("type", UNIT_TYPES, t("filters.anyType"))}
        </fieldset>
        <fieldset>
          <legend>{t("filters.view")}</legend>
          {chips("view", UNIT_VIEWS, t("filters.anyView"))}
        </fieldset>
        <Stepper label={t("filters.guests")} value={filters.guests} max={20} onChange={(guests) => apply({ guests })} />
        <Stepper label={t("filters.bedrooms")} value={filters.bedrooms} max={8} onChange={(bedrooms) => apply({ bedrooms })} />
        <label>
          <span className="pb-label">{t("filters.seaDistance")}</span>
          <select
            className="pb-select num"
            value={filters.maxSeaDistance || ""}
            onChange={(e) => apply({ maxSeaDistance: Number(e.target.value) || 0 })}
          >
            <option value="">{t("filters.anyDistance")}</option>
            {SEA_DISTANCES.map((m) => (
              <option key={m} value={m}>
                {t("filters.withinMeters", { meters: m })}
              </option>
            ))}
          </select>
        </label>
      </aside>

      <div className="pb-results" data-pending={pending} aria-busy={pending}>
        <div className="pb-results-head">
          <p className="num" style={{ margin: 0, fontWeight: 600 }} aria-live="polite">
            {pending ? t("filters.updating") : count}
          </p>
          <label style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="pb-label" style={{ margin: 0 }}>
              {t("filters.sort")}
            </span>
            <select className="pb-select" style={{ inlineSize: "auto" }} value={filters.sort || "created_desc"} onChange={(e) => apply({ sort: e.target.value === "created_desc" ? "" : e.target.value })}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const t = useTranslations("public.filters");
  return (
    <div role="group" aria-label={label}>
      <span className="pb-label">{label}</span>
      <div className="pb-stepper">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0} aria-label={t("decrease", { label })}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <output aria-live="polite">{value ? t("atLeast", { count: value }) : t("any")}</output>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t("increase", { label })}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
