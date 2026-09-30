"use server";

import { revalidatePath } from "next/cache";

import { assertId } from "@/lib/admin/actions";
import { ApiError, adminGet, adminSend } from "@/lib/admin/api";
import { addDays } from "@/lib/admin/timeline";
import type { Taken } from "@/lib/admin/stay-picker";

/** A unit's closed nights from two months back to about fifteen months ahead. */
export async function takenNights(unitId: string, today: string): Promise<Taken> {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(today) ? addDays(today, -60) : addDays(new Date().toISOString().slice(0, 10), -60);
  return adminGet<Taken>(`/units/${assertId(unitId)}/taken?from=${from}&to=${addDays(from, 490)}`);
}

export type ManualBookingInput = {
  unitId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  phone: string;
  name: string;
  /** Piasters per night; 0 takes the unit's price. */
  nightlyPrice: number;
};

/** Books the stay; answers with the new booking's id, or the API's error code. */
export async function createManualBooking(input: ManualBookingInput): Promise<{ id?: string; error?: string }> {
  const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
  try {
    const b = await adminSend<{ id: string }>("POST", "/bookings", {
      unit_id: String(input.unitId),
      check_in: day(input.checkIn),
      check_out: day(input.checkOut),
      guests: Math.trunc(Number(input.guests)) || 0,
      phone: String(input.phone).slice(0, 40),
      name: String(input.name).slice(0, 120),
      nightly_price: Number.isInteger(input.nightlyPrice) && input.nightlyPrice > 0 ? input.nightlyPrice : 0,
    });
    revalidatePath("/[locale]/dashboard", "layout");
    return { id: b.id };
  } catch (e) {
    return { error: e instanceof ApiError ? e.code : "error" };
  }
}
