import type { ReactNode } from "react";

import type { Tone } from "@/lib/admin/labels";

/** The system's StateBadge: a dot and a word, never colour alone. */
export function StateBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`bs-badge bs-badge--${tone}`}>
      <span className="bs-badge__dot" aria-hidden="true" />
      {children}
    </span>
  );
}
