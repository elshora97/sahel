# Admin dashboard redesign: design spec

Redesign of the Phase 2d admin (`/dashboard`) onto the Beet Elsahel design system, with an Arabic/English toggle and three usability fixes. Functionality and the admin API contract do not change. This supersedes spec §4 of `2026-09-08-phase-2-catalog-design.md` on look, language and layout only; §4's page list, form conventions and image-manager behaviour still hold.

**Sources**
- Design system "Beet Elsahel", https://claude.ai/artifact/LmyUFrChGwsFN9WBnvPLux, version `1790169313-6dfc`: `project/tokens.json`, `project/README.md`, `project/components/bundle.css`.
- App design, https://claude.ai/artifact/3H1YXkZQ2X4ALPvpxLycDz, board `Dashboard.dc.html`: the admin shell and dashboard layout.

## 1. Scope

**In**
- The admin moves to `/[locale]/dashboard/**` (Arabic default, RTL; English, LTR), with a language switch.
- The Beet Elsahel tokens and component stylesheet are brought into the web app, and the admin is rebuilt on them.
- A sidebar shell and a redesigned overview, lists, forms, image manager and danger zone.
- Usability: a sectioned unit form with a sticky save bar; in-app modals (success after every create/update/delete, confirm before every delete, discard-changes on leaving); search and filters on lists.

**Out**
- Public pages (Phase 2e). They will reuse the tokens and components added here.
- Renaming the public site's "Marsa" copy to "Beet Elsahel": Phase 2e, together with the public pages.
- Drag-and-drop image upload and drag reordering.
- Future nav sections from the app design (Timeline, Bookings, Payments, Customers, Reports, Settings). Each appears when its phase lands.
- Browser `alert`/`confirm` dialogs: none remain in the admin. The only native prompt left is `beforeunload` on tab close or refresh, where browsers allow no custom UI.
- Translating Go API validation messages: they stay English inside a translated banner until the Phase 7 copy review.

## 2. Routing and language

- Pages live under `web/src/app/[locale]/dashboard/**` with the same structure as today (`areas`, `compounds`, `owners`, `units`, each with `page`, `new`, `[id]`). `app/dashboard/**` is removed, along with its separate `<html>` layout. `[locale]/layout.tsx` owns `lang` and `dir`.
- Middleware:
  - `/dashboard` and `/dashboard/*` → 307 to `/ar/dashboard` and `/ar/dashboard/*`.
  - `/{ar|en}/dashboard` and `/{ar|en}/dashboard/*` → Basic auth (unchanged `isAuthorized`), then next-intl.
  - Everything else → next-intl as today.
- Server Actions redirect to locale-prefixed paths: an action receives the locale as a bound argument.
- Copy: `web/src/messages/{ar,en}.json` gain an `admin` namespace (nav, page titles, field labels, hints, buttons, empty states, toasts, banner titles, filter labels) and an `enums` namespace with a label for every value from `/admin/enums` (region, beach_type, type, view, unit_status). Pages use `getTranslations`; client components use `useTranslations`.
- Arabic is written first, in clear MSA with everyday Egyptian vocabulary, sentence case, and no arrows in buttons (design system README, content fundamentals).
- Numerals are Western in both languages (`ar-EG-u-nu-latn`). Dates use `Africa/Cairo`.
- The language switch in the sidebar links to the same path in the other locale, keeping the query string.

## 3. Design system in the app

- `web/src/styles/beet-elsahel.css`: a verbatim copy of the system's `components/bundle.css`, with a header comment naming the source URL and version. Drop the `@import` of Google Fonts (the app already loads Readex Pro through `next/font`). Nothing else changes, so a later update to the system is a re-copy.
- `web/src/app/globals.css`: the `:root` tokens are aligned to `tokens.json`:
  - Colours: `ink`, `ink-muted`, `sea`, `sea-deep`, `lagoon`, `sand`, `shell`, `surface`, `sun`, `sun-soft`, `lagoon-soft`, `sea-soft`, `state-blocked`, `state-past`, `line`, `line-control`, `danger`.
  - Spacing `space-1` to `space-16`; `radius-sm`, `radius-md`, `radius-lg`; `shadow-sheet`; `--font-sans`.
  - Each is exposed to Tailwind through `@theme inline`, so classes like `bg-sea-soft`, `text-ink-muted` and `border-line` work.
  - Existing shadcn variable names stay, mapped onto these tokens (`--destructive` → `danger`, `--border` → `line`, `--input` → `line-control`).
- `web/src/components/ds/`: thin React 19 components rendering the stylesheet's classes, with no styling of their own beyond layout:
  - `Button`: `variant` primary, secondary, quiet or danger; `size` sm, md or lg; renders as `<button>`, or as a Next `<Link>` when given `href`.
  - `StateBadge`: `tone` free, held, confirmed, neutral, muted, blocked, attention or danger, plus a label. A `unitStatusTone()` helper maps unit status to a tone: active→confirmed, draft→neutral, paused→attention, archived→muted.
  - `Card`: `surface`, `line` hairline, `radius-md`, padding `space-6`, optional title row with actions.
  - `StatTile`: label, value in the `stat` style (40px, weight 200, tabular numbers), note, optional `href`.
  - `DataTable`: `thead` in the caption style on the card, `line` row dividers, whole-row links, and an empty state.
  - `Modal`: a native `<dialog>` opened with `showModal()`, so focus is trapped, Escape closes it, the page behind is inert and focus returns to the opener. It is `surface`, `radius-lg` and `shadow-sheet`, 440px max inline size, over a `ink` 40% backdrop. It has a `title`-style heading, a body line, and a button row at the end edge (confirm last in reading order). It is direction-aware through the page's `dir`, and the first focus goes to the safe button (Cancel or Done).
- Rules from the system that bind every admin file:
  - Logical properties only (no `left`/`right`, `ml`/`mr`, `pl`/`pr`; use `ms`/`me`/`ps`/`pe`/`start`/`end`).
  - One primary button per view.
  - No arrows or emoji in labels.
  - Tabular numerals for every number and date.
  - Focus is a 2px `sea` ring offset by 2px.
  - `sea` text only on `shell`/`surface`, `sea-deep` on tints.
  - No shadow except `shadow-sheet` on floating surfaces (the save bar, modals and toasts).
  - Direction-bearing icons (chevrons) mirror in RTL.

## 4. Shell

From `Dashboard.dc.html`:

- **Sidebar:** 232px, `surface`, `line` border on its end edge, sticky and full height.
- **Brand block:** "بيت الساحل" / "Beet Elsahel" (20px, 600, `sea`) over "لوحة التحكم" / "Dashboard" (13px, `ink-muted`).
- **Nav:** Overview, Areas, Compounds, Owners, Units. Items are 15px with 10×12px padding and `radius-md`. The active item (matched by path prefix) gets `sea-soft` fill, `sea-deep` text, weight 500 and `aria-current="page"`.
- **Sidebar foot:** the language switch ("English" in Arabic, "العربية" in English) above a line reading "Admin" / "مسؤول".
- **Main:** padding `32px 40px`. The title row has the `heading` style h1, an optional muted subtitle, and actions at the end edge.
- **Below 1024px:** the sidebar collapses into a top bar with the brand and a menu button that opens the nav as a sheet (`shadow-sheet`).

## 5. Screens

- **Overview:**
  - Four `StatTile`s: active units, draft units, compounds, owners. Each links to its list, filtered where it applies (drafts → units `?status=draft`).
  - A "Needs attention" card: draft units, and units with no cover image, each row linking to the unit. It is hidden when empty. (The admin list carries only `cover_url`, and the first upload always becomes the cover, so "no cover" means "no images".)
  - A "Recently edited" `DataTable`: the last 8 units.
- **Lists:**
  - Title row with the count ("12 وحدة" / "12 units", and "· 3 match" when filtered) and a "New …" primary button.
  - A filter bar (§6.3), then a `DataTable` in a `Card`. The whole row opens the record.
  - Units: cover thumbnail 56×40 `radius-sm` (`sand` field when none), title in the current locale with the other language muted beneath, compound, type label, `StateBadge`, and edited time.
  - Areas: name (locale, other muted), region label, km, order.
  - Compounds: name, area, beach type label, featured (the word "مميز" / "Featured", not a symbol).
  - Owners: name, phone (`dir="ltr"`), email, commission %.
- **Forms:**
  - Each section is a `Card` with a `title`-style heading.
  - Bilingual pairs stay side by side, Arabic `dir="rtl"` with the Arabic field first in both locales.
  - Inputs: `surface`, `line-control` border, `radius-md`, 42px min height, `sea` focus ring. Required fields show "*" plus `aria-required`.
  - Hints use the caption style in `ink-muted`.
  - Enum `<select>`s show localised labels with the API value as the option value.
- **Image manager:** same behaviour as Phase 2d, restyled:
  - A grid of `radius-lg` photos at their own aspect ratio.
  - The cover chip ("الغلاف" / "Cover") is a `StateBadge` with the confirmed tone.
  - Alt-text pair, move earlier/later (quiet buttons with direction-mirrored chevrons), and delete (danger, sm, confirmed in a modal, §6.2).
  - The upload button is secondary.
- **Danger zone:** a `Card` at the end with a one-line consequence and the danger button, which opens the delete confirm modal (§6.2). A 409 shows in the error banner: "لا يمكن الحذف" / "Can't delete" plus the API message.

## 6. Usability fixes

### 6.1 Sectioned unit form and sticky save bar

- Unit sections, in order:
  1. Basics: compound, owner, status, type.
  2. Title & description: title pair, slug, description pair.
  3. Rooms & guests: bedrooms, bathrooms, base guests, max guests, area m².
  4. Location: sea distance, row, view, floor, latitude, longitude.
  5. Amenities & house rules: amenities, house-rules pair.
  6. Private: exact address, with the note "Never shown on the public site".
  7. Images: edit page only, outside the form.
- A jump list under the title links to each section's `id`.
- **Save bar:** a sticky footer at the block-end of the main area. It uses `surface` with `shadow-sheet` and a `line` top border. It holds the primary Save button (the view's one primary), a secondary Cancel link back to the list, and at the start edge an "Unsaved changes" / "تغييرات غير محفوظة" hint.
- The hint appears once the user edits any field (a form-level `input`/`change` listener sets a dirty flag). It clears after a successful save.
- **Leaving with unsaved changes** (only while dirty):
  - In-app navigation (sidebar, list links, Cancel, the language switch, browser back within the dashboard) opens a modal: "تجاهل التغييرات غير المحفوظة؟" / "Discard unsaved changes?", with the body "Your edits to this form will be lost." The buttons are "متابعة التعديل" / "Keep editing" (secondary, focused) and "تجاهل" / "Discard" (danger). Discard continues to the destination.
  - It works through a dashboard-wide `UnsavedChangesProvider`. Dashboard links go through a `GuardedLink` that asks the provider before navigating, and a `popstate` handler covers back and forward.
  - Closing or refreshing the tab falls back to the browser's `beforeunload` prompt: the one case where no custom UI is possible.
- Areas, compounds and owners forms use the same save bar without the jump list. Compounds keep sections (Basics, Description, Place, Amenities & gate).

### 6.2 Modals for actions

**Success after every create, update and delete**
- The Server Action redirects with `?done=created|saved|deleted&name=<display name>`, where the display name is the record's name in the current locale.
- A client `ActionResultModal` in the dashboard layout reads the parameters, opens the success modal, then removes the parameters with `router.replace`, so a refresh or the back button doesn't reopen it.
- The success modals:

| action | title | body | buttons |
|---|---|---|---|
| created | "تمت الإضافة" / "Created" | "«name» was added." | "إضافة آخر" / "Add another" (secondary, links to the `new` page) · "تم" / "Done" (primary, closes; you're on the new record's page) |
| saved | "تم الحفظ" / "Saved" | "Changes to «name» were saved." | "العودة للقائمة" / "Back to list" (secondary) · "تم" / "Done" (primary, closes and stays) |
| deleted | "تم الحذف" / "Deleted" | "«name» was deleted." | "تم" / "Done" (primary; you're on the list) |

- Image **upload** ("تم رفع n صور" / "n images uploaded") and image **delete** ("تم حذف الصورة" / "Image deleted") open the same modal from the image manager, with no URL change and a single "Done".
- Inline image edits (alt text on blur, set cover, move earlier or later) show a small toast instead: `surface`, `shadow-sheet`, bottom inline-end corner, 3s, `role="status"`, e.g. "تم تحديث الغلاف" / "Cover updated". This is a deliberate exception, because a modal after every blur or click would block editing.

**Confirm before every delete**
- Deleting an area, compound, owner, unit or image opens a confirm modal first: title "حذف «name»؟" / "Delete «name»?", body "لا يمكن التراجع عن هذا." / "This can't be undone.", plus one entity-specific line (unit: "Its images are removed too."; area, compound or owner: "Only possible when nothing uses it.").
- The buttons are "إلغاء" / "Cancel" (secondary, focused) and "حذف" / "Delete" (danger). The action runs only on Delete. While it runs, the Delete button shows "جارٍ الحذف…" / "Deleting…" and both buttons are disabled.
- If the delete fails (for example a 409 "still referenced"), the confirm modal closes and the error shows in the page's banner, not in a modal.

**Errors**
- Save and create errors are not modals. They show in the form's banner (`danger` border, `role="alert"`), titled "لم يتم الحفظ" / "Not saved", and the banner scrolls into view and takes focus. The admin keeps their input.

### 6.3 Search and filters

- **Units:** `q` (matches `title_ar`, `title_en` and `slug`, case-insensitive; Arabic matched as typed), `status`, `compound` (id) and `type`.
- **Areas, compounds and owners:** `q` only. It matches name pair and slug; for owners, name, phone and email.
- State lives in the query string. The filter bar is a `GET` form: the search input submits on Enter and after 300ms of no typing; selects submit on change. A "Clear" quiet button appears when any filter is set.
- Filtering runs on the server in the page, over the admin list the API already returns (spec §4.4 row counts). It is a pure `filterRows()` helper in `web/src/lib/admin/filter.ts`. No API change and no pagination.
- Empty result: "لا توجد نتائج مطابقة" / "Nothing matches these filters", with the Clear button.

## 7. Error handling

Unchanged from Phase 2d (`ApiError` → banner, 404 → the not-found page), except that the not-found page moves under `[locale]/dashboard/not-found.tsx` and is translated.

## 8. Testing and acceptance

**Automated**
- `npm test` covers:
  - `filterRows` (each filter, combined filters, Arabic query, empty query);
  - `unitStatusTone`;
  - locale path helpers (the switch link keeps path and query; the legacy `/dashboard` redirect target);
  - `done`/`name` result-parameter parsing (valid kinds only; unknown values ignored);
  - the unsaved-changes guard's decision function (dirty × same-page vs other destination).
- `npm run typecheck` and `npm run build` pass. `make test` stays green.

**Smoke**
- Every admin page returns 200 under `/ar/dashboard/*` (with `dir="rtl"`) and `/en/dashboard/*` (with `dir="ltr"`) with the password, and 401 without it.
- `/dashboard/units` → 307 to `/ar/dashboard/units`.

**Manual, in a browser (the owner)**
1. Switch language on any page: same page, other direction, filters kept.
2. Create a unit → "Created" modal (Add another / Done). Edit it: the unsaved hint appears; save → "Saved" modal, hint gone; refresh → no modal.
2b. Edit a field, then click a sidebar link → "Discard unsaved changes?" modal; Keep editing stays, Discard leaves. Edit again and close the tab → browser's own warning.
3. Unit list: search an Arabic title, filter by draft status and by compound; clear.
4. Delete an image and a unit → confirm modal first (Cancel focused), then a "Deleted" modal. Delete a referenced compound → confirm, then a translated "Can't delete" banner with the API reason. Escape closes every modal; focus returns to the button that opened it.
5. Keyboard only: every control is reachable, and focus rings are visible on `shell` and `surface`.
6. At 800px wide the sidebar becomes the top bar and sheet.

## 9. Addendum: row delete and the units grid (2026-09-23)

**Delete from lists.** Every list row (areas, compounds, owners, units) and every unit grid card gets a small danger "Delete" button, placed above the row's stretched link so it doesn't open the record. It opens the same confirm modal as the Danger zone. On success the admin returns to the same list with the same query string (filters, search and view), minus the `done`/`name` handshake, and sees the "Deleted" modal. On failure (409 "still referenced") the modal closes and a "Can't delete" banner appears above the list. The Server Actions' return query is sanitised: only a string starting with `?` is kept, then re-serialised without `done`/`name`.

**Units grid.**
- Grid is the **default** units view; `?view=table` shows the table. A Table/Grid switch (links, `aria-current` on the active one) sits in the title row before "Add unit". The view lives in the query string alongside the filters.
- Cards use the design system's `bs-unit` classes: a 4:3 `radius-lg` photo (the system's empty-photo horizon when there's no cover), the status `StateBadge` as the photo flag, "compound · type" in `bs-unit__place`, the title in `bs-unit__title` (the whole card opens the unit), "bedrooms · max guests · sea distance" in `bs-unit__meta`, and the row-delete button.
- Columns: 1 on phones, 2 from 640px, 4 from 1280px.
- API: `AdminListUnits` also returns `sea_distance_m` (additive).
