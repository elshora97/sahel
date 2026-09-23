"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { slugTaken } from "@/app/[locale]/dashboard/slug-action";
import { slugify } from "@/lib/slug";
import { hintCls, inputCls, labelCls } from "./ui";

type Status = "idle" | "checking" | "taken" | "free";

/** Auto-fills from the English name on blur while empty; checks uniqueness on blur. */
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
  const t = useTranslations("admin.slug");
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

  return (
    <label className="block">
      <span className={labelCls}>{t("label")}</span>
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
      <span className={`${hintCls} ${status === "taken" ? "text-danger" : ""}`}>{t(status)}</span>
    </label>
  );
}
