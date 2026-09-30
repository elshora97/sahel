"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition, type CSSProperties } from "react";

import { Button, buttonClass } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";
import { useToast } from "@/components/admin/toast";
import { inputCls, labelCls } from "@/components/admin/ui";
import { createBlock, deleteBlock } from "@/app/[locale]/dashboard/timeline/actions";
import { pick } from "@/lib/admin/labels";
import { dayRange, isWeekend, nightsBetween, place, selection } from "@/lib/admin/timeline";
import type { Timeline, TimelineBlock, TimelineUnit } from "@/lib/admin/types";
import { GuardedLink } from "./guarded-link";

const PHONE = "(max-width: 767px)";

/** Phones show one week; everything wider shows the whole range. */
function usePhone(): boolean {
  return useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

type Pending = { unit: TimelineUnit; start: string; end: string; nights: number };
type Open = { unit: TimelineUnit; block: TimelineBlock };

const ERROR_CODES = ["dates_taken", "overlaps_block", "invalid_range", "not_found"] as const;

/**
 * The units timeline: one row per unit, one column per night. Booking bars
 * open the booking; a click on a free day, then another on the same row,
 * blocks those nights; a click on a block offers to unblock it.
 */
export function TimelineGrid({ data }: { data: Timeline }) {
  const t = useTranslations("admin.timeline");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const phone = usePhone();
  const count = phone ? Math.min(7, data.days) : data.days;
  const days = dayRange(data.from, count);

  const [start, setStart] = useState<{ unitId: string; day: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useTransition();

  // Esc drops a half-made selection.
  useEffect(() => {
    if (!start) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStart(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start]);

  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const weekdayFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { weekday: "short", timeZone: "UTC" });
  const date = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));
  const unitName = (u: TimelineUnit) => pick(locale, u.title_ar, u.title_en);
  const errorText = (code: string) => t(`errors.${(ERROR_CODES as readonly string[]).includes(code) ? code : "error"}` as "errors.error");

  const clickDay = (unit: TimelineUnit, day: string) => {
    if (!start || start.unitId !== unit.id) return setStart({ unitId: unit.id, day });
    setStart(null);
    setNote("");
    setError(null);
    setPending({ unit, ...selection(start.day, day) });
  };
  const closeAll = () => {
    setPending(null);
    setOpen(null);
    setError(null);
  };
  const saveBlock = () =>
    pending &&
    run(async () => {
      const r = await createBlock(pending.unit.id, pending.start, pending.end, note);
      if (r.error) return setError(errorText(r.error));
      toast(t("blocked"));
      closeAll();
      router.refresh();
    });
  const unblock = () =>
    open &&
    run(async () => {
      const r = await deleteBlock(open.block.id);
      if (r.error && r.error !== "not_found") return setError(errorText(r.error));
      toast(t("unblocked"));
      closeAll();
      router.refresh();
    });

  // Columns: the unit name, then one per night.
  const grid: CSSProperties = { gridTemplateColumns: `var(--tl-label) repeat(${count}, minmax(var(--tl-day), 1fr))` };

  if (data.units.length === 0) return <p className="px-6 py-12 text-center text-sm text-ink-muted">{t("empty")}</p>;

  return (
    <>
      <p className="num mb-1 font-medium">
        {date(days[0])} – {date(days[days.length - 1])}
      </p>
      <p className="mb-3 text-sm text-ink-muted" aria-live="polite">
        {start ? t("pickEnd", { unit: unitName(data.units.find((u) => u.id === start.unitId)!) }) : t("hint")}
      </p>
      <div className="tl overflow-x-auto rounded-lg border border-line bg-surface">
        <div className="min-w-max">
          <div className="tl-row tl-head" style={grid}>
            <div className="tl-label">
              {t("unitCol")}
            </div>
            {days.map((d) => (
              <div
                key={d}
                className="tl-day-head"
                data-weekend={isWeekend(d) || undefined}
                data-today={d === data.today || undefined}
                aria-current={d === data.today ? "date" : undefined}
                title={date(d)}
              >
                <span className="block text-[11px] text-ink-muted">{weekdayFmt.format(new Date(`${d}T00:00:00Z`))}</span>
                <span className="num block text-[15px] font-medium">{Number(d.slice(8))}</span>
              </div>
            ))}
          </div>

          {data.units.map((u) => (
            <div key={u.id} className="tl-row" style={grid}>
              <div className="tl-label">
                <span className="block truncate font-medium">{unitName(u)}</span>
                <span className="block truncate text-xs text-ink-muted">{pick(locale, u.compound_name_ar, u.compound_name_en)}</span>
              </div>

              {days.map((d, i) => {
                const past = d < data.today;
                const selected = start?.unitId === u.id && start.day === d;
                const cellStyle = { gridColumn: i + 2, gridRow: 1 };
                if (past)
                  return (
<div key={d} className="tl-cell" data-past data-weekend={isWeekend(d) || undefined} style={cellStyle} />
                  );
                return (
                  <div key={d} className="tl-cell" data-weekend={isWeekend(d) || undefined} data-today={d === data.today || undefined} style={cellStyle}>
                    <button
                      type="button"
                      className="tl-hit"
                      aria-pressed={selected}
                      aria-label={start?.unitId === u.id ? t("endDay", { unit: unitName(u), date: date(d) }) : t("freeDay", { unit: unitName(u), date: date(d) })}
                      onClick={() => clickDay(u, d)}
                    />
                  </div>
                );
              })}

              {u.bookings.map((b) => {
                const p = place(b.check_in, b.check_out, data.from, count);
                if (!p) return null;
                return (
                  <GuardedLink
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className="tl-bar"
                    data-status={b.status}
                    data-clip-start={p.clippedStart || undefined}
                    data-clip-end={p.clippedEnd || undefined}
                    style={{ gridColumn: `${p.col + 2} / span ${p.span}`, gridRow: 1 }}
                    aria-label={t("bookingLabel", { ref: b.ref, guest: b.customer_name, start: date(b.check_in), end: date(b.check_out) })}
                    title={`${b.ref} · ${b.customer_name}`}
                  >
                    <span className="truncate">{b.customer_name}</span>
                  </GuardedLink>
                );
              })}

              {u.blocks.map((k) => {
                const p = place(k.start, k.end, data.from, count);
                if (!p) return null;
                return (
                  <button
                    type="button"
                    key={k.id}
                    className="tl-bar"
                    data-status="blocked"
                    data-clip-start={p.clippedStart || undefined}
                    data-clip-end={p.clippedEnd || undefined}
                    style={{ gridColumn: `${p.col + 2} / span ${p.span}`, gridRow: 1 }}
                    onClick={() => {
                      setError(null);
                      setOpen({ unit: u, block: k });
                    }}
                    title={k.note || t("legendBlocked")}
                  >
                    <span className="truncate">{k.note || t("legendBlocked")}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
        <li className="flex items-center gap-2">
          <span className="tl-swatch" data-status="confirmed" aria-hidden="true" />
          {t("legendBooked")}
        </li>
        <li className="flex items-center gap-2">
          <span className="tl-swatch" data-status="pending_payment" aria-hidden="true" />
          {t("legendHeld")}
        </li>
        <li className="flex items-center gap-2">
          <span className="tl-swatch" data-status="blocked" aria-hidden="true" />
          {t("legendBlocked")}
        </li>
      </ul>

      <Modal
        open={pending !== null}
        onClose={closeAll}
        busy={busy}
        title={pending ? t("blockTitle", { unit: unitName(pending.unit) }) : ""}
        actions={
          <>
            <Button data-autofocus onClick={closeAll} disabled={busy}>
              {t("cancel")}
            </Button>
            {pending && (
              <GuardedLink
                href={{ pathname: "/dashboard/bookings/new", query: { unit: pending.unit.id, in: pending.start, out: pending.end } }}
                className={buttonClass("secondary")}
              >
                {t("bookInstead")}
              </GuardedLink>
            )}
            <Button variant="primary" onClick={saveBlock} disabled={busy}>
              {t("block")}
            </Button>
          </>
        }
      >
        {pending && (
          <>
            <p>{t("blockBody", { start: date(pending.start), end: date(pending.end), count: pending.nights })}</p>
            <label className="mt-4 block text-ink">
              <span className={labelCls}>{t("note")}</span>
              <input className={inputCls} value={note} maxLength={200} placeholder={t("notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {error}
              </p>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={open !== null}
        onClose={closeAll}
        busy={busy}
        title={open ? t("blockedTitle", { unit: unitName(open.unit) }) : ""}
        actions={
          <>
            <Button data-autofocus onClick={closeAll} disabled={busy}>
              {t("close")}
            </Button>
            <Button variant="danger" onClick={unblock} disabled={busy}>
              {t("unblock")}
            </Button>
          </>
        }
      >
        {open && (
          <>
            <p>
              {t("blockedBody", {
                start: date(open.block.start),
                end: date(open.block.end),
                count: nightsBetween(open.block.start, open.block.end),
              })}
            </p>
            {open.block.note && <p className="text-ink">{open.block.note}</p>}
            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {error}
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
