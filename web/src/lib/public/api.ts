import { notFound } from "next/navigation";

import type {
  AreaDetail,
  AreaSummary,
  AvailabilityDay,
  CompoundDetail,
  CompoundSummary,
  Page,
  QuoteBreakdown,
  QuoteResult,
  UnitCardData,
  UnitDetail,
} from "./types";
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

/** Fresh on every call: availability is what guests act on. */
export async function getAvailability(slug: string, from: string, to: string): Promise<AvailabilityDay[]> {
  const res = await fetch(apiUrl(base(), `/units/${slug}/availability`, `from=${from}&to=${to}`), { cache: "no-store" });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Availability answered ${res.status}`);
  return (await res.json()) as AvailabilityDay[];
}

/** Like getAvailability, but a unit that fails answers null instead of failing the page. */
export async function tryAvailability(slug: string, from: string, to: string): Promise<AvailabilityDay[] | null> {
  const res = await fetch(apiUrl(base(), `/units/${slug}/availability`, `from=${from}&to=${to}`), { cache: "no-store" }).catch(
    () => null,
  );
  if (!res?.ok) return null;
  return (await res.json()) as AvailabilityDay[];
}

/** A priced stay, or the code of the first availability rule it breaks. */
export async function postQuote(slug: string, checkIn: string, checkOut: string, guests: number): Promise<QuoteResult> {
  const res = await fetch(apiUrl(base(), `/units/${slug}/quote`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ check_in: checkIn, check_out: checkOut, guests }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (res.ok) return { ok: true, quote: body as QuoteBreakdown };
  if (res.status === 422 || res.status === 404) return { ok: false, code: body?.error?.code ?? "unavailable" };
  throw new Error(`Quote answered ${res.status}`);
}
