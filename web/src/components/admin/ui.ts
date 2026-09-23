/** Form control classes on the system's tokens: surface, line-control border, sea focus ring. */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea";
export const inputCls = `min-h-[42px] w-full rounded-md border border-line-control bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-ink-muted ${focusRing}`;
export const labelCls = "mb-1.5 block text-sm font-medium";
export const hintCls = "mt-1.5 block text-xs leading-4 text-ink-muted";
export const linkCls = `font-medium text-sea hover:text-sea-deep ${focusRing} rounded-sm`;
