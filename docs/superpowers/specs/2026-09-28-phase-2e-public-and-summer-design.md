# Phase 2e: public catalogue and the "Summer" design system

Finishes Phase 2 by building the public pages from `2026-09-08-phase-2-catalog-design.md` §5, and replaces the Beet Elsahel look with a brighter "Summer" system shared by the public site and the admin. The direction ("Bright summer resort", option B) was picked from a side-by-side preview on 2026-09-28. Functionality of §5 and of the admin redesign (`2026-09-23-admin-redesign-design.md`) does not change; this spec overrides only their look.

## 1. Scope

**In**
- New token values, fonts, shadows, radii and motion tokens; a rewritten `web/src/styles/beet-elsahel.css`.
- Public routes: `/[locale]`, `/[locale]/search`, `/[locale]/unit/[slug]`, `/[locale]/compound/[slug]`, `/[locale]/destinations/[area]`.
- Public header and footer; public copy renamed from "Marsa" to "بيت الساحل" / "Beet Elsahel".
- Interactions: view transitions, hover lift and zoom, chip press, scroll reveal, swipe lightbox, spring toasts and modals, loading skeletons.
- The admin restyled onto the new system in a calmer register.

**Out**
- Prices, calendars, availability (Phase 3). The price slot shows "Pricing coming soon".
- Maps, JSON-LD, image derivatives and blurhash (Phase 7).
- New endpoints. One additive tweak only: public unit list rows (`GET /units`, units inside `GET /compounds/:slug`) gain `cover_url`, and search rows gain `compound_name_ar` and `area_name_ar`, because the unit card needs them.

## 2. Design system

Token **names** stay, so `components/ds/*` and every admin file keep compiling. Values change.

| Token | Value | Use |
|---|---|---|
| `sea` | #00A0B0 | brand, links, focus ring, active nav |
| `sea-deep` | #0B6E78 | text on tints, hover of `sea` |
| `sea-soft` | #DDF5F3 | chip fill, active nav fill |
| `sun` | #FF6F59 | primary button, highlights |
| `sun-soft` | #FFE3DD | coral tint |
| `lagoon` | #FFD166 | warm accent in heroes and badges |
| `lagoon-soft` | #FFF3D1 | attention tint |
| `shell` | #F0FBFA | page background |
| `surface` | #FFFFFF | cards, inputs, sheets |
| `sand` | #F6EFE3 | image placeholder field |
| `ink` | #0B3B3C | text |
| `ink-muted` | #4F6F70 | secondary text |
| `line` / `line-control` | #D5EBE9 / #A9CFCC | dividers / input borders |
| `danger` | #D6453D | destructive |

State colours are re-tuned onto this palette. Every text/background pair used must reach WCAG AA (4.5:1 body, 3:1 large text and UI); primary button text on `sun` is `ink`-dark if white fails, checked at build time of the tokens.

- Radii: `radius-sm` 10px, `radius-md` 16px, `radius-lg` 24px, `radius-pill` 999px.
- Shadows: `shadow-card` (0 10px 26px -14px ink at 27%), `shadow-lift` (0 18px 34px -16px sea at 40%), `shadow-sheet` kept for floating surfaces. The old "no shadows" rule is lifted for cards.
- Type: Baloo Bhaijaan 2 (500, 700) via `next/font` as `--font-display` for h1–h3 and card titles; Readex Pro stays as `--font-sans` for body and UI. Tabular numerals stay for numbers and dates.
- Motion: `--ease-spring: cubic-bezier(.2,.8,.2,1)`, `--dur-1` 150ms, `--dur-2` 250ms, `--dur-3` 400ms. Under `prefers-reduced-motion: reduce` all transforms and animations are disabled; colour transitions remain.
- Rules from the admin spec that still bind: logical properties only, one primary button per view, no arrows or emoji in labels, visible 2px `sea` focus ring, direction-mirrored chevrons.

## 3. Public pages

All server-rendered. Data comes from a new `web/src/lib/public/api.ts` calling the Go public API on the server (`GET /areas`, `/areas/:slug`, `/compounds?area=`, `/compounds/:slug`, `/units`, `/units/:slug`). Unknown slugs and archived units call `notFound()`. Images use `next/image` with the existing MinIO `remotePatterns`.

- **Shell:** `(public)` layout with a sticky header (logo "بيت الساحل", links Destinations and Search, language switch) and a footer. The header gains a `surface` background and `shadow-card` once scrolled.
- **Home:** rounded (`radius-lg`) hero with the cover of the newest featured unit (a `sea`→`lagoon` gradient when none), display headline, pill search bar (area select, guests) that submits to `/search`. Featured compounds as a horizontal scroll-snap strip. "New on the coast": grid of the 8 newest active units.
- **Search:** filter bar with area and compound selects (compound options narrow to the chosen area), type and view chips, guests and bedrooms steppers, max sea distance select, sort select. Every change writes the URL (client component using `router.replace`), and the server re-renders. Result grid of `UnitCard`s, count line, previous/next pagination, `loading.tsx` skeleton grid, empty state "مفيش وحدات مطابقة، جرّب تخفف الفلاتر" / "No units match — try loosening the filters" with a reset link.
- **UnitCard:** cover at 4:3, `radius-lg`, title (display face), compound · area, bedrooms, max guests, sea distance, view label; "Pricing coming soon" chip. Whole card is a link.
- **Unit detail:** gallery (cover + up to 4), "Show all photos" opens the lightbox. Meta block, amenities (unit and compound merged, de-duplicated case-insensitively, unit order first), description and house rules in the current locale (other locale as fallback), compound card linking to its page, approximate location line ("180 m to sea · row 1 · sea view"). Sticky side card with title and "Pricing coming soon". `generateMetadata` sets title, description and og image.
- **Compound:** hero with cover, breadcrumb (area), description, beach type, amenities, gate info, unit grid.
- **Destination:** area name, region, featured compounds strip, paginated unit grid.

## 4. Interactions

- **View transitions:** card cover → detail gallery through `view-transition-name` set per unit, with cross-document `@view-transition { navigation: auto; }`. Unsupported browsers navigate normally.
- **Hover:** cards lift (`translateY(-6px)`, `shadow-lift`) and their image zooms to 1.06; buttons scale to 1.04; chips pop to 1.05 when selected.
- **Scroll reveal:** sections fade and rise with `animation-timeline: view()` inside `@supports`; without support they are simply visible.
- **Lightbox:** native `<dialog>` with arrow keys, swipe (pointer events), thumbnail strip, counter, Escape to close, focus returned to the opener.
- **Toasts and modals (admin):** spring slide-in on the existing components.

## 5. Admin

Same palette, fonts and radii; calmer: no rotation, hover lift limited to 2px, durations capped at `--dur-2`. Primary button is `sun`, active nav is `sea-soft` with `sea-deep` text, cards use `radius-md` and `shadow-card`. No behaviour, route or copy changes.

## 6. Copy

`web/src/messages/{ar,en}.json` gain a `public` namespace (nav, hero, filters, card, detail, empty states, pagination, 404). Arabic first, MSA with everyday Egyptian vocabulary. Enum labels reuse the existing `enums` namespace.

## 7. Testing and acceptance

- Node tests: public API client URL building and 404 handling, search-params ⇄ filter mapping, amenity merge.
- `tsc --noEmit`, the existing test suite and `next build` pass.
- One browser pass at desktop and mobile widths, Arabic and English, covering the Phase 2 manual acceptance steps 6–11 and a reduced-motion check.
