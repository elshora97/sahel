"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";

import { OSM_ATTRIBUTION, OSM_TILES, pinIcon } from "./map-pin";

/**
 * The unit page's map: the exact pin, zoomable, without catching the page's
 * scroll (the wheel and one-finger drags scroll the page, not the map).
 */
export function UnitMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false, dragging: !L.Browser.mobile, zoomControl: true }).setView([lat, lng], 15);
      L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
      L.marker([lat, lng], { icon: pinIcon(L), keyboard: false, title: label }).addTo(map);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, label]);

  return <div ref={box} className="map-box h-[320px]" role="img" aria-label={label} />;
}
