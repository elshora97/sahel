/** Beet Elsahel's mark: a debossed roundel holding the horizon and one wave. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="fo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 17.5h20" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 22c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="12" r="3" fill="var(--fo-brass)" />
    </svg>
  );
}
