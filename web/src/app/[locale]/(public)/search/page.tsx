import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonClass } from "@/components/ds/button";
import { Pagination } from "@/components/public/pagination";
import { UnitGrid } from "@/components/public/unit-card";
import { Link } from "@/i18n/navigation";
import { listAreas, listCompounds, searchUnits } from "@/lib/public/api";
import { activeFilterCount, filtersToQuery, parseSearchParams } from "@/lib/public/search-params";
import { SearchControls } from "./search-controls";

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.results" });
  return { title: t("title") };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("public");
  const filters = parseSearchParams(await searchParams);
  const query = filtersToQuery(filters);

  const [areas, compounds, results] = await Promise.all([
    listAreas(),
    listCompounds("size=60"),
    searchUnits(`${query ? `${query}&` : ""}size=${PAGE_SIZE}`),
  ]);

  return (
    <>
      <h1 className="pb-title" style={{ marginBlockStart: 32 }}>
        {t("results.title")}
      </h1>
      <SearchControls filters={filters} areas={areas} compounds={compounds.items} count={t("results.count", { count: results.total })}>
        {results.items.length > 0 ? (
          <>
            <UnitGrid units={results.items} />
            <Pagination
              page={results.page}
              size={results.size}
              total={results.total}
              href={(page) => {
                const q = filtersToQuery(filters, page);
                return `/${locale}/search${q ? `?${q}` : ""}`;
              }}
            />
          </>
        ) : (
          <div className="pb-empty">
            <SearchX size={48} strokeWidth={1.6} aria-hidden="true" />
            <h2>{t("empty.title")}</h2>
            <p>{t("empty.body")}</p>
            {activeFilterCount(filters) > 0 && (
              <Link href="/search" className={buttonClass("primary")}>
                {t("empty.action")}
              </Link>
            )}
          </div>
        )}
      </SearchControls>
    </>
  );
}
