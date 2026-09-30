/** Time left until an ISO timestamp, split for display; `over` once it has passed. */
export function remaining(until: string | null, now = Date.now()) {
  const ms = until ? Date.parse(until) - now : 0;
  if (!(ms > 0)) return { hours: 0, minutes: 0, seconds: 0, over: true };
  const total = Math.floor(ms / 1000);
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60, over: false };
}
