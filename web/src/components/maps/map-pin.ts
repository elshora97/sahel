import type * as Leaflet from "leaflet";

/** The North Coast, roughly El Alamein: where a new unit's map opens. */
export const NORTH_COAST: [number, number] = [30.83, 28.95];

export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** A drawn pin (no image files), in the brand colours. */
export function pinIcon(L: typeof Leaflet): Leaflet.DivIcon {
  return L.divIcon({
    className: "map-pin",
    html: '<span class="map-pin__dot"></span>',
    iconSize: [32, 42],
    iconAnchor: [16, 40],
  });
}

/** Six decimals (about 10 cm), the precision the database keeps. */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** A Google Maps link that opens directions to the pin. */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
