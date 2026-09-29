"use server";

import { assertId, attempt } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";

export async function cancelBooking(id: string, reason: string) {
  return attempt(() => adminSend("POST", `/bookings/${assertId(id)}/cancel`, { reason: String(reason).slice(0, 300) }));
}

/** For a guest who forgot their password: the admin sets one and tells them. */
export async function setGuestPassword(customerId: string, password: string) {
  return attempt(() => adminSend("POST", `/customers/${assertId(customerId)}/password`, { password: String(password).slice(0, 72) }));
}
