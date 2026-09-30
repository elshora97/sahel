"use client";

import "leaflet/dist/leaflet.css";

import type * as Leaflet from "leaflet";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ds/button";
import { NORTH_COAST, OSM_ATTRIBUTION, OSM_TILES, pinIcon, round6 } from "./map-pin";

type Point = { lat: number; lng: number } | null;

/**
 * The unit form's location: click the map to drop the pin, drag it to fine
 * tune, or remove it. The coordinates travel in hidden `lat` and `lng`
 * inputs, and each change fires an input event so the form knows it's
 * edited (for the unsaved-changes prompt).
 */
export function LocationPicker({ lat, lng }: { lat?: number | null; lng?: number | null }) {
  const t = useTranslations("admin.units");
  const box = useRef<HTMLDivElement>(null);
  const signal = useRef<HTMLInputElement>(null);
  const api = useRef<{ map: Leaflet.Map; L: typeof Leaflet; marker: Leaflet.Marker | null } | null>(null);
  const [point, setPoint] = useState<Point>(lat != null && lng != null ? { lat, lng } : null);

  const edited = () => queueMicrotask(() => signal.current?.dispatchEvent(new Event("input", { bubbles: true })));

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !box.current || api.current) return;
      const start = lat != null && lng != null ? ([lat, lng] as [number, number]) : NORTH_COAST;
      const map = L.map(box.current, { scrollWheelZoom: false }).setView(start, lat != null ? 16 : 9);
      L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
      api.current = { map, L, marker: null };

      const place = (ll: Leaflet.LatLng) => {
        const p = { lat: round6(ll.lat), lng: round6(ll.lng) };
        const a = api.current!;
        if (!a.marker) {
          a.marker = L.marker(ll, { icon: pinIcon(L), draggable: true, keyboard: true, title: t("mapPin") }).addTo(map);
          a.marker.on("dragend", () => {
            const m = a.marker!.getLatLng();
            setPoint({ lat: round6(m.lat), lng: round6(m.lng) });
            edited();
          });
        } else {
          a.marker.setLatLng(ll);
        }
        setPoint(p);
      };
      if (lat != null && lng != null) place(L.latLng(lat, lng));
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        place(e.latlng);
        edited();
      });
    });
    return () => {
      cancelled = true;
      api.current?.map.remove();
      api.current = null;
    };
    // The map is built once; later pins come from clicks and drags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = () => {
    const a = api.current;
    if (a?.marker) {
      a.marker.remove();
      a.marker = null;
    }
    setPoint(null);
    edited();
  };

  return (
    <div className="space-y-2">
      <div ref={box} className="map-box h-[340px]" role="application" aria-label={t("mapLabel")} />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-ink-muted" aria-live="polite">
          {point ? (
            <>
              {t("mapPinned")}{" "}
              <span className="num text-ink" dir="ltr">
                {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
              </span>
            </>
          ) : (
            t("mapHint")
          )}
        </span>
        {point && (
          <Button variant="quiet" size="sm" onClick={clear}>
            {t("mapClear")}
          </Button>
        )}
      </div>
      <input type="hidden" name="lat" value={point?.lat ?? ""} />
      <input type="hidden" name="lng" value={point?.lng ?? ""} />
      <input ref={signal} type="hidden" aria-hidden="true" />
    </div>
  );
}
