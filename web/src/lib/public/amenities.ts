/**
 * Unit amenities first, then the compound's that the unit doesn't already
 * list. Matching ignores case and surrounding spaces; the unit's spelling wins.
 */
export function mergeAmenities(unit: string[] | null | undefined, compound: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(unit ?? []), ...(compound ?? [])]) {
    const item = raw.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
