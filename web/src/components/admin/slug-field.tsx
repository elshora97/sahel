"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { slugTaken } from "@/app/dashboard/slug-action";
import { slugify } from "@/lib/slug";
import { hintCls, inputCls, labelCls } from "./ui";

type Status = "idle" | "checking" | "taken" | "free";

/**
 * Spec §4.2: auto-fills from the English name on blur (only while empty),
 * stays editable, and checks uniqueness against the API on blur. Leaving it
 * blank lets the API derive one.
 */
export function SlugField({
  entity,
  sourceName,
  currentId,
  defaultValue,
}: {
  entity: "areas" | "compounds" | "units";
  sourceName: string;
  currentId?: string;
  defaultValue?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");

  const check = useCallback(
    async (value: string) => {
      if (!value) return setStatus("idle");
      setStatus("checking");
      setStatus((await slugTaken(entity, value, currentId)) ? "taken" : "free");
    },
    [entity, currentId],
  );

  useEffect(() => {
    const input = ref.current;
    const source = input?.form?.elements.namedItem(sourceName);
    if (!input || !(source instanceof HTMLInputElement)) return;
    const fill = () => {
      if (input.value !== "") return;
      input.value = slugify(source.value);
      void check(input.value);
    };
    source.addEventListener("blur", fill);
    return () => source.removeEventListener("blur", fill);
  }, [sourceName, check]);

  const hint = {
    idle: "Leave blank to generate it from the English name.",
    checking: "Checking…",
    taken: "Already used. Pick another.",
    free: "Available.",
  }[status];

  return (
    <label className="block">
      <span className={labelCls}>Slug</span>
      <input
        ref={ref}
        name="slug"
        dir="ltr"
        className={inputCls}
        defaultValue={defaultValue ?? ""}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        onBlur={(e) => {
          e.currentTarget.value = slugify(e.currentTarget.value);
          void check(e.currentTarget.value);
        }}
      />
      <span className={`${hintCls} ${status === "taken" ? "text-destructive" : ""}`}>{hint}</span>
    </label>
  );
}
