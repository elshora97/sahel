import type { ReactNode } from "react";

// Each subtree ([locale], dashboard) renders its own <html> with the right
// lang and dir, so the top-level layout only passes children through.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
