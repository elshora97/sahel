/** Beet Elsahel's mark: a tear-off calendar sheet with its red header band. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="nt-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="5" y="4" width="22" height="25" fill="var(--nt-paper)" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5" y="4" width="22" height="7" fill="var(--nt-red)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="7.5" r="1.4" fill="var(--nt-paper)" />
      <path d="M9 17h14M9 21h14M9 25h8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
