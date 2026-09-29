"use server";

import { assertId, attempt } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";

export async function cancelBooking(id: string, reason: string) {
  return attempt(() => adminSend("POST", `/bookings/${assertId(id)}/cancel`, { reason: String(reason).slice(0, 300) }));
}
