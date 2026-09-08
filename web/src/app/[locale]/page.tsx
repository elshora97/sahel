import { getTranslations, setRequestLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { formatEGP } from "@/lib/utils";

const paletteTokens = [
  { key: "ink", swatch: "bg-ink", hex: "#0B2A3A" },
  { key: "sea", swatch: "bg-sea", hex: "#0F7C86" },
  { key: "lagoon", swatch: "bg-lagoon", hex: "#7FD4D0" },
  { key: "sand", swatch: "bg-sand", hex: "#E8DCC8" },
  { key: "shell", swatch: "bg-shell", hex: "#FBFAF7" },
  { key: "sun", swatch: "bg-sun", hex: "#F2B233" },
] as const;

const stateTokens = [
  { key: "free", swatch: "bg-lagoon" },
  { key: "held", swatch: "bg-sun" },
  { key: "confirmed", swatch: "bg-sea" },
  { key: "blocked", swatch: "bg-state-blocked" },
  { key: "past", swatch: "bg-state-past" },
] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const nav = await getTranslations("nav");
  const palette = await getTranslations("palette");
  const states = await getTranslations("states");

  const nightlyPiasters = 1450000;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <span className="text-lg font-medium text-sea">مرسى</span>
          <nav className="hidden gap-5 text-sm text-muted-foreground sm:flex">
            <span>{nav("destinations")}</span>
            <span>{nav("compounds")}</span>
            <span>{nav("villas")}</span>
            <span>{nav("help")}</span>
          </nav>
          <div className="ms-auto">
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="display text-4xl font-semibold text-ink">{t("heading")}</h1>
        <p className="prose-measure mt-4 text-muted-foreground">{t("lede")}</p>

        <section className="mt-12 rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <h2 className="text-lg font-medium text-ink">{t("sampleUnitTitle")}</h2>
              <p className="num mt-1 text-sm text-muted-foreground">
                {t("sampleUnitMeta")}
              </p>
            </div>
            <p className="num ms-auto text-2xl font-medium text-ink">
              {formatEGP(nightlyPiasters, locale)}
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                {t("perNight")}
              </span>
            </p>
          </div>
          <p className="mt-3 inline-block rounded-md bg-sun/20 px-2 py-1 text-sm text-ink">
            {t("seasonLabel")}
          </p>
        </section>

        <section className="mt-10 border-s-4 border-s-sea bg-sand/40 p-6">
          <h2 className="text-lg font-medium text-ink">{t("mirrorHeading")}</h2>
          <p className="prose-measure mt-2 text-sm text-muted-foreground">
            {t("mirrorBody")}
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-medium text-ink">{t("paletteHeading")}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {paletteTokens.map((token) => (
              <div
                key={token.key}
                className="flex items-center gap-3 rounded-md border border-border p-3"
              >
                <span
                  className={`${token.swatch} size-8 shrink-0 rounded border border-border`}
                />
                <span className="text-sm text-ink">{palette(token.key)}</span>
                <span className="num ms-auto text-xs text-muted-foreground">
                  {token.hex}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {stateTokens.map((token) => (
              <span
                key={token.key}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-ink"
              >
                <span className={`${token.swatch} size-3 rounded-sm`} />
                {states(token.key)}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
