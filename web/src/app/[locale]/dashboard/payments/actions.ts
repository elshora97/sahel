"use server";

import { assertId, attempt } from "@/lib/admin/actions";
import { adminSend } from "@/lib/admin/api";

const money = (n: number) => (Number.isInteger(n) && n > 0 ? n : 0);

export async function verifyPayment(id: string, amount: number) {
  return attempt(() => adminSend("POST", `/payments/${assertId(id)}/verify`, { amount: money(amount) }));
}

export async function rejectPayment(id: string, reason: string) {
  return attempt(() => adminSend("POST", `/payments/${assertId(id)}/reject`, { reason: String(reason).slice(0, 300) }));
}

export async function recordPayment(bookingId: string, amount: number, senderName: string, notes: string) {
  return attempt(() =>
    adminSend("POST", `/bookings/${assertId(bookingId)}/payments`, {
      amount: money(amount),
      sender_name: String(senderName).slice(0, 120),
      notes: String(notes).slice(0, 300) || null,
    }),
  );
}

export async function saveInstapay(address: string, mobile: string, holderName: string) {
  return attempt(() =>
    adminSend("PUT", "/settings/instapay", {
      address: String(address).slice(0, 120),
      mobile: String(mobile).slice(0, 40),
      holder_name: String(holderName).slice(0, 120),
    }),
  );
}
