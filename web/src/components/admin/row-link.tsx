import { GuardedLink } from "./guarded-link";

/** The record link in a table row; its ::after covers the row, so the whole row opens it. */
export function RowLink({ href, primary, secondary }: { href: string; primary: string; secondary?: string }) {
  return (
    <GuardedLink
      href={href}
      className="font-medium text-ink outline-none after:absolute after:inset-0 after:content-[''] hover:text-sea-deep"
    >
      {primary}
      {secondary && (
        <span className="block text-xs font-normal text-ink-muted" dir="auto">
          {secondary}
        </span>
      )}
    </GuardedLink>
  );
}
