"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { Modal } from "@/components/ds/modal";
import { useToast } from "@/components/admin/toast";
import { hintCls, inputCls, labelCls } from "@/components/admin/ui";
import { pick } from "@/lib/admin/labels";
import type { CalendarRow, Season } from "@/lib/admin/types";
import { addDays, addMonths, monthGrid, toPiasters, weekdayOrder } from "@/lib/public/calendar";
import { formatEGP } from "@/lib/utils";
import {
  copySeasons,
  deleteSeason,
  editCalendar,
  loadCalendar,
  saveSeason,
  type CalendarEdit,
  type SeasonPayload,
} from "@/app/[locale]/dashboard/units/pricing-actions";

type Month = { year: number; month: number };
const monthStart = (m: Month) => `${m.year}-${String(m.month).padStart(2, "0")}-01`;
const monthEnd = (m: Month) => addDays(monthStart(addMonths(m.year, m.month, 1)), -1);

/** Seasons (which generate prices) and the per-date calendar editor for one unit. */
export function PricingPanel({
  unitId,
  seasons,
  calendar,
  today,
  otherUnits,
}: {
  unitId: string;
  seasons: Season[];
  calendar: CalendarRow[];
  today: string;
  otherUnits: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-6">
      <SeasonsCard unitId={unitId} seasons={seasons} otherUnits={otherUnits} />
      <CalendarCard key={seasons.map((s) => s.id + s.nightly_price + s.start_date + s.end_date).join()} unitId={unitId} initial={calendar} today={today} />
    </div>
  );
}

function useWeekdayNames() {
  const locale = useLocale();
  return useMemo(
    () => (wd: number, style: "short" | "narrow" = "short") =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2027, 0, 3 + wd))),
    [locale],
  );
}

function SeasonsCard({ unitId, seasons, otherUnits }: { unitId: string; seasons: Season[]; otherUnits: { id: string; name: string }[] }) {
  const t = useTranslations("admin.pricing");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const weekdayName = useWeekdayNames();
  const [editing, setEditing] = useState<Season | "new" | null>(null);
  const [deleting, setDeleting] = useState<Season | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const run = (work: () => Promise<{ error?: string }>, done: string, close: () => void) =>
    start(async () => {
      const r = await work();
      if (r.error) return setError(r.error);
      setError(null);
      close();
      toast(done);
      router.refresh();
    });

  return (
    <Card
      id="seasons"
      title={t("seasons")}
      actions={
        <>
          {otherUnits.length > 0 && (
            <Button variant="quiet" size="sm" onClick={() => setCopying(true)}>
              {t("copy")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setEditing("new")}>
            {t("addSeason")}
          </Button>
        </>
      }
    >
      {seasons.length === 0 ? (
        <p className="text-ink-muted">{t("noSeasons")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {seasons.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
              <div className="min-w-40">
                <p className="font-medium">{pick(locale, s.name_ar, s.name_en)}</p>
                <p className="num text-sm text-ink-muted">
                  {s.start_date} → {s.end_date}
                </p>
              </div>
              <p className="num font-medium">{formatEGP(s.nightly_price, locale)}</p>
              <p className="num text-sm text-ink-muted">
                {t("minNightsShort", { count: s.min_nights })}
                {s.weekend_uplift_pct > 0 && ` · ${t("upliftShort", { pct: s.weekend_uplift_pct })}`}
                {" · "}
                {s.allowed_checkin_days.length ? s.allowed_checkin_days.map((d) => weekdayName(d)).join("، ") : t("anyDay")}
                {s.priority !== 0 && ` · ${t("priorityShort", { n: s.priority })}`}
              </p>
              <div className="ms-auto flex gap-2">
                <Button variant="quiet" size="sm" onClick={() => setEditing(s)}>
                  {t("edit")}
                </Button>
                <Button variant="danger" size="sm" onClick={() => setDeleting(s)}>
                  {t("delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <SeasonModal
          season={editing === "new" ? null : editing}
          busy={busy}
          error={error}
          onClose={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={(body) =>
            run(() => saveSeason(unitId, editing === "new" ? null : editing.id, body), t("saved"), () => setEditing(null))
          }
        />
      )}

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        busy={busy}
        title={t("deleteTitle")}
        actions={
          <>
            <Button data-autofocus onClick={() => setDeleting(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => deleting && run(() => deleteSeason(unitId, deleting.id), t("deleted"), () => setDeleting(null))}>
              {t("delete")}
            </Button>
          </>
        }
      >
        <p>{deleting && t("deleteBody", { name: pick(locale, deleting.name_ar, deleting.name_en) })}</p>
        {error && <p className="mt-2 text-danger">{error}</p>}
      </Modal>

      <Modal
        open={copying}
        onClose={() => setCopying(false)}
        busy={busy}
        title={t("copyTitle")}
        actions={
          <>
            <Button data-autofocus onClick={() => setCopying(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button variant="primary" disabled={busy || !copyFrom} onClick={() => run(() => copySeasons(unitId, copyFrom), t("copied"), () => setCopying(false))}>
              {t("copyConfirm")}
            </Button>
          </>
        }
      >
        <p className="mb-3">{t("copyBody")}</p>
        <select className={inputCls} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label={t("copyFrom")}>
          <option value="">{t("copyFrom")}</option>
          {otherUnits.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {error && <p className="mt-2 text-danger">{error}</p>}
      </Modal>
    </Card>
  );
}

function SeasonModal({
  season,
  busy,
  error,
  onClose,
  onSave,
}: {
  season: Season | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: SeasonPayload) => void;
}) {
  const t = useTranslations("admin.pricing");
  const weekdayName = useWeekdayNames();
  const [days, setDays] = useState<number[]>(season?.allowed_checkin_days ?? []);
  const [local, setLocal] = useState<string | null>(null);
  const formId = "season-form";

  const submit = (fd: FormData) => {
    const price = toPiasters(String(fd.get("nightly_price") ?? ""));
    if (!price) return setLocal(t("priceInvalid"));
    setLocal(null);
    onSave({
      name_ar: String(fd.get("name_ar") ?? "").trim(),
      name_en: String(fd.get("name_en") ?? "").trim(),
      start_date: String(fd.get("start_date")),
      end_date: String(fd.get("end_date")),
      nightly_price: price,
      min_nights: Number(fd.get("min_nights")),
      allowed_checkin_days: [...days].sort(),
      weekend_uplift_pct: Number(fd.get("weekend_uplift_pct") || 0),
      priority: Number(fd.get("priority") || 0),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title={season ? t("editSeason") : t("addSeason")}
      actions={
        <>
          <Button data-autofocus onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy}>
            {t("saveSeason")}
          </Button>
        </>
      }
    >
      <form id={formId} action={submit} className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={labelCls}>{t("nameAr")} *</span>
          <input className={inputCls} name="name_ar" dir="rtl" required defaultValue={season?.name_ar} />
        </label>
        <label>
          <span className={labelCls}>{t("nameEn")} *</span>
          <input className={inputCls} name="name_en" dir="ltr" required defaultValue={season?.name_en} />
        </label>
        <label>
          <span className={labelCls}>{t("start")} *</span>
          <input className={`${inputCls} num`} type="date" name="start_date" required defaultValue={season?.start_date} />
        </label>
        <label>
          <span className={labelCls}>{t("end")} *</span>
          <input className={`${inputCls} num`} type="date" name="end_date" required defaultValue={season?.end_date} />
        </label>
        <label>
          <span className={labelCls}>{t("nightlyPrice")} *</span>
          <input className={`${inputCls} num`} name="nightly_price" inputMode="decimal" dir="ltr" required defaultValue={season ? season.nightly_price / 100 : ""} />
        </label>
        <label>
          <span className={labelCls}>{t("minNights")} *</span>
          <input className={`${inputCls} num`} type="number" min={1} name="min_nights" required defaultValue={season?.min_nights ?? 1} />
        </label>
        <label>
          <span className={labelCls}>{t("uplift")}</span>
          <input className={`${inputCls} num`} type="number" min={0} max={300} name="weekend_uplift_pct" defaultValue={season?.weekend_uplift_pct ?? 0} />
          <span className={hintCls}>{t("upliftHint")}</span>
        </label>
        <label>
          <span className={labelCls}>{t("priority")}</span>
          <input className={`${inputCls} num`} type="number" name="priority" defaultValue={season?.priority ?? 0} />
          <span className={hintCls}>{t("priorityHint")}</span>
        </label>
        <fieldset className="sm:col-span-2">
          <legend className={labelCls}>{t("checkinDays")}</legend>
          <div className="flex flex-wrap gap-2">
            {weekdayOrder.map((wd) => (
              <label key={wd} className="pb-chip">
                <input type="checkbox" checked={days.includes(wd)} onChange={(e) => setDays((d) => (e.target.checked ? [...d, wd] : d.filter((x) => x !== wd)))} />
                {weekdayName(wd)}
              </label>
            ))}
          </div>
          <span className={hintCls}>{t("checkinHint")}</span>
        </fieldset>
      </form>
      {(local || error) && <p className="mt-3 text-danger">{local || error}</p>}
    </Modal>
  );
}

function CalendarCard({ unitId, initial, today }: { unitId: string; initial: CalendarRow[]; today: string }) {
  const t = useTranslations("admin.pricing");
  const locale = useLocale();
  const toast = useToast();
  const weekdayName = useWeekdayNames();
  const first: Month = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const [view, setView] = useState<Month>(first);
  const [rows, setRows] = useState(() => new Map(initial.map((r) => [r.date, r])));
  const [sel, setSel] = useState<{ from?: string; to?: string }>({});
  const [price, setPrice] = useState("");
  const [minNights, setMinNights] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const merge = (list: CalendarRow[], from: string, to: string) =>
    setRows((prev) => {
      const next = new Map(prev);
      for (let d = from; d <= to; d = addDays(d, 1)) next.delete(d);
      for (const r of list) next.set(r.date, r);
      return next;
    });

  const go = (delta: number) => {
    const next = addMonths(view.year, view.month, delta);
    setView(next);
    if (![...rows.keys()].some((d) => d.startsWith(monthStart(next).slice(0, 7)))) {
      start(async () => merge(await loadCalendar(unitId, monthStart(next), monthEnd(next)), monthStart(next), monthEnd(next)));
    }
  };

  // Click a day to start, click another to finish; shift-click extends.
  const pickDay = (date: string, shift: boolean) =>
    setSel((s) => {
      if (s.from && (shift || !s.to)) return date < s.from ? { from: date, to: s.from } : { from: s.from, to: date };
      return { from: date };
    });

  const from = sel.from;
  const to = sel.to ?? sel.from;
  const apply = (action: CalendarEdit["action"]) => {
    if (!from || !to) return;
    const edit: CalendarEdit = { from, to, action };
    if (action === "override") {
      if (price) {
        const p = toPiasters(price);
        if (p === null) return setError(t("priceInvalid"));
        edit.price = p;
      }
      if (minNights) edit.min_nights = Number(minNights);
      if (note) edit.note = note;
      if (edit.price === undefined && edit.min_nights === undefined && edit.note === undefined) return setError(t("overrideNeeds"));
    }
    start(async () => {
      const r = await editCalendar(unitId, edit);
      if (r.error) return setError(r.error);
      setError(null);
      merge(r.rows ?? [], from, to);
      toast(t(`done.${action}`));
    });
  };

  const selected = (d: string) => !!from && !!to && d >= from && d <= to;
  const monthName = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(view.year, view.month - 1, 1)),
  );
  const num = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { maximumFractionDigits: 0 });

  return (
    <Card
      id="calendar"
      title={t("calendar")}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="quiet" size="sm" onClick={() => go(-1)} aria-label={t("prevMonth")}>
            <ChevronLeft size={18} className="pb-flip" aria-hidden="true" />
          </Button>
          <span className="num min-w-32 text-center font-medium">{monthName}</span>
          <Button variant="quiet" size="sm" onClick={() => go(1)} aria-label={t("nextMonth")}>
            <ChevronRight size={18} className="pb-flip" aria-hidden="true" />
          </Button>
        </div>
      }
    >
      <p className={`${hintCls} mb-3`}>{t("calendarHint")}</p>
      <div className="grid grid-cols-7 gap-1" data-busy={busy} style={{ opacity: busy ? 0.6 : 1 }}>
        {weekdayOrder.map((wd) => (
          <span key={wd} className="pb-1 text-center text-xs font-semibold text-ink-muted">
            {weekdayName(wd, "short")}
          </span>
        ))}
        {monthGrid(view.year, view.month)
          .flat()
          .map((date, i) => {
            if (!date) return <span key={`b${i}`} />;
            const r = rows.get(date);
            const state = !r ? "none" : r.is_available ? "open" : "blocked";
            return (
              <button
                key={date}
                type="button"
                onClick={(e) => pickDay(date, e.shiftKey)}
                aria-pressed={selected(date)}
                title={r?.note ?? undefined}
                className={[
                  "relative flex min-h-16 flex-col items-start rounded-sm border p-1.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea",
                  selected(date) ? "border-sun bg-sun-soft" : "border-line",
                  state === "open" ? "bg-surface hover:bg-sea-soft" : state === "blocked" ? "bg-state-past" : "bg-shell text-ink-muted",
                ].join(" ")}
              >
                <span className={`num text-sm font-semibold ${state === "blocked" ? "line-through" : ""}`}>{Number(date.slice(8))}</span>
                {r && <span className="num text-xs">{num.format(r.price / 100)}</span>}
                {r && <span className="num text-[11px] text-ink-muted">{t("minNightsShort", { count: r.min_nights })}</span>}
                {r?.source === "manual" && <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-sun" aria-label={t("manual")} />}
              </button>
            );
          })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-muted" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full bg-sun" /> {t("manual")}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-sm bg-state-past" /> {t("blocked")}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-sm border border-line bg-shell" /> {t("noSeason")}
        </span>
      </div>

      {from && (
        <div className="mt-5 grid gap-4 rounded-md border border-line bg-shell p-4">
          <p className="num font-medium">{from === to ? t("selectedOne", { date: from }) : t("selectedRange", { from, to: to! })}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className={labelCls}>{t("nightlyPrice")}</span>
              <input className={`${inputCls} num`} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" dir="ltr" />
            </label>
            <label>
              <span className={labelCls}>{t("minNights")}</span>
              <input className={`${inputCls} num`} value={minNights} onChange={(e) => setMinNights(e.target.value)} type="number" min={1} />
            </label>
            <label>
              <span className={labelCls}>{t("note")}</span>
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => apply("override")}>
              {t("applyOverride")}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => apply("block")}>
              {t("block")}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => apply("unblock")}>
              {t("unblock")}
            </Button>
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => apply("reset")}>
              {t("reset")}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setSel({})}>
              {t("clearSelection")}
            </Button>
          </div>
          {error && <p className="text-danger">{error}</p>}
        </div>
      )}
    </Card>
  );
}
