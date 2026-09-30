/** A round top for the scale and three evenly spaced grid lines under it. */
export function niceScale(peak: number): { max: number; steps: number[] } {
  if (peak <= 0) return { max: 1, steps: [] };
  const raw = peak / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { max: step * 3, steps: [step, step * 2, step * 3] };
}
