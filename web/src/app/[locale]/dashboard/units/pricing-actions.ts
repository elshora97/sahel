"use server";

import { assertId, attempt, errorMessage } from "@/lib/admin/actions";
import { adminGet, adminSend } from "@/lib/admin/api";
import type { CalendarRow } from "@/lib/admin/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface SeasonPayload {
  name_ar: string;
  name_en: string;
  start_date: string;
  end_date: string;
  nightly_price: number;
  min_nights: number;
  allowed_checkin_days: number[];
  weekend_uplift_pct: number;
  priority: number;
}

export async function saveSeason(unitId: string, seasonId: string | null, body: SeasonPayload) {
  const base = `/units/${assertId(unitId)}/seasons`;
  return attempt(() => (seasonId ? adminSend("PATCH", `${base}/${assertId(seasonId)}`, body) : adminSend("POST", base, body)));
}

export async function deleteSeason(unitId: string, seasonId: string) {
  return attempt(() => adminSend("DELETE", `/units/${assertId(unitId)}/seasons/${assertId(seasonId)}`));
}

export async function copySeasons(unitId: string, fromUnitId: string) {
  return attempt(() => adminSend("POST", `/units/${assertId(unitId)}/seasons/copy`, { from_unit_id: assertId(fromUnitId) }));
}

export async function loadCalendar(unitId: string, from: string, to: string): Promise<CalendarRow[]> {
  if (!DATE.test(from) || !DATE.test(to)) return [];
  return adminGet<CalendarRow[]>(`/units/${assertId(unitId)}/calendar?from=${from}&to=${to}`);
}

export interface CalendarEdit {
  from: string;
  to: string;
  action: "override" | "block" | "unblock" | "reset";
  price?: number;
  min_nights?: number;
  note?: string;
}

export async function editCalendar(unitId: string, edit: CalendarEdit): Promise<{ error?: string; rows?: CalendarRow[] }> {
  if (!DATE.test(edit.from) || !DATE.test(edit.to)) return { error: "invalid dates" };
  try {
    const rows = await adminSend<CalendarRow[]>("POST", `/units/${assertId(unitId)}/calendar`, edit);
    return { rows };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
