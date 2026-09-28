import { notFound } from "next/navigation";

import type { AreaDetail, AreaSummary, CompoundDetail, CompoundSummary, Page, UnitCardData, UnitDetail } from "./types";
import { apiUrl } from "./urls";

/**
 * Server-side reads of the public catalogue. Pages render from these; the
 * browser never calls the API for first paint.
 */

function base(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";
}

async function publicGet<T>(path: string, query = ""): Promise<T> {
  const res = await fetch(apiUrl(base(), path, query), { next: { revalidate: 60 } });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Public API ${path} answered ${res.status}`);
  return (await res.json()) as T;
}

export const listAreas = () => publicGet<AreaSummary[]>("/areas");
export const getArea = (slug: string) => publicGet<AreaDetail>(`/areas/${slug}`);
export const listCompounds = (query = "") => publicGet<Page<CompoundSummary>>("/compounds", query);
export const getCompound = (slug: string, query = "") => publicGet<CompoundDetail>(`/compounds/${slug}`, query);
export const searchUnits = (query = "") => publicGet<Page<UnitCardData>>("/units", query);
export const getUnit = (slug: string) => publicGet<UnitDetail>(`/units/${slug}`);
