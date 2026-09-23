import type { Metadata } from "next";
import Link from "next/link";
import { Readex_Pro } from "next/font/google";

import "../globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-readex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sahel admin",
  robots: { index: false, follow: false },
};

// Every admin page reads live data; nothing here is cacheable.
export const dynamic = "force-dynamic";

const nav = [
  ["Areas", "/dashboard/areas"],
  ["Compounds", "/dashboard/compounds"],
  ["Owners", "/dashboard/owners"],
  ["Units", "/dashboard/units"],
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className={`${readex.variable} min-h-screen bg-background text-foreground`}>
        <header className="border-b border-border bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/dashboard" className="font-semibold">
              Sahel admin
            </Link>
            {nav.map(([label, href]) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
