import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/admin/labels";
import type { CompoundSummary } from "@/lib/public/types";

export async function CompoundCard({ compound }: { compound: CompoundSummary }) {
  const locale = await getLocale();
  const enums = await getTranslations("enums");
  return (
    <Link href={`/compound/${compound.slug}`} className="pb-compound">
      {compound.cover_image_url && <img src={compound.cover_image_url} alt="" loading="lazy" decoding="async" />}
      <h3 className="pb-compound__name">{pick(locale, compound.name_ar, compound.name_en)}</h3>
      <p className="pb-compound__meta">{enums(`beach_type.${compound.beach_type}`)}</p>
    </Link>
  );
}

export function CompoundStrip({ compounds }: { compounds: CompoundSummary[] }) {
  return (
    <div className="pb-strip">
      {compounds.map((c) => (
        <CompoundCard key={c.id} compound={c} />
      ))}
    </div>
  );
}
