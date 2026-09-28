"use server";

import { getAvailability, postQuote } from "@/lib/public/api";
import type { AvailabilityDay, QuoteResult } from "@/lib/public/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** More months for the calendar as the guest pages through it. */
export async function loadAvailability(slug: string, from: string, to: string): Promise<AvailabilityDay[]> {
  if (!DATE.test(from) || !DATE.test(to)) return [];
  return getAvailability(slug, from, to);
}

export async function quoteStay(slug: string, checkIn: string, checkOut: string, guests: number): Promise<QuoteResult> {
  if (!DATE.test(checkIn) || !DATE.test(checkOut) || !Number.isInteger(guests)) return { ok: false, code: "invalid_range" };
  return postQuote(slug, checkIn, checkOut, guests);
}
