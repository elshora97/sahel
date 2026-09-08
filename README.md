# Marsa — Sahel rentals

Vacation rentals for the Egyptian North Coast. Monorepo: `web` (Next.js 15),
`api` (Go 1.23), `infra` (Docker, migrations).

`01-design-and-requirements.md` is the source of truth. `DECISIONS.md` records
every decision taken where the spec was silent or contradicted itself — read it
before changing anything about booking statuses or money.

**This repo is at the end of phase 1.** Foundation only: it runs, it speaks two
languages, it has a palette and a database. It does not yet have units,
calendars, bookings or payments.

---

## Prerequisites

- Docker with Compose v2
- Node.js 20 or newer
- Go 1.23 (only for running tests outside Docker; `make dev` doesn't need it)

## Run it

```bash
cp .env.example .env    # already done if you're reading this from the tarball
make dev
```

That brings up Postgres, MinIO and the API in Docker, then installs and starts
Next.js on the host. First run pulls images and downloads Go modules, so give it
a few minutes.

| What | Where |
|---|---|
| Arabic site (default) | http://localhost:3000/ar |
| English site | http://localhost:3000/en |
| API liveness | http://localhost:8080/healthz |
| API readiness | http://localhost:8080/readyz |
| MinIO console | http://localhost:9001 |

`make help` lists everything else: `up`, `down`, `nuke`, `logs`, `migrate`,
`migrate-status`, `sqlc`, `test`.

## Verify it by hand

1. **The mirror.** Open `/ar`, click the language button, watch `/en` load. The
   nav, the price, and the coloured bar on the "mirror proof" panel should all
   swap sides. Nothing in the codebase branches on locale to do this — the
   layout uses `ms-auto` and `border-s-4`, which are logical properties.
2. **The palette.** Six swatches with their hex values, plus the five booking
   states. If a colour appears anywhere that isn't in `globals.css`, that's a bug.
3. **Tabular numerals.** The price and the unit metadata carry `.num`. Compare
   the digit widths against the body text.
4. **Readiness actually checks something.** `docker compose -f infra/docker-compose.yml stop postgres`,
   then hit `/readyz` — it returns 503 while `/healthz` stays 200. That split is
   deliberate: a database blip shouldn't get the container killed.

## Run the tests

```bash
make test
```

Two Go packages have real tests already, both guarding decisions rather than
code:

- `internal/money` — deposit percentages round **up**, in integer piasters, and
  the amount-with-suffix is never less than the amount due (D-008, D-009).
- `internal/domain/booking` — `Occupying` is the single source of truth for
  which statuses hold dates. `TestMigrationPredicateMatchesDomain` reads
  `infra/migrations/*.sql` and fails if the `bookings_no_overlap` predicate ever
  drifts from it. It **skips today** and starts enforcing the moment the phase 4
  migration lands. That test is the fix for the original spec's worst bug — see
  D-001.

## Layout

```
api/
  cmd/api/main.go            chi server, graceful shutdown, waits for Postgres
  cmd/worker/main.go          stub until phase 4
  internal/config/            env loading, fails fast on a missing DATABASE_URL
  internal/http/              router, request logging, CORS
  internal/domain/booking/    status enum + Occupying + the drift test
  internal/money/             integer piasters, ceil-rounded percentages
  internal/store/postgres/    sqlc output lands here
infra/
  docker-compose.yml          postgres 16, minio, api
  postgres/init/              btree_gist, before any migration runs
  migrations/                 goose
web/
  src/i18n/                   next-intl routing, request config, navigation
  src/app/[locale]/           layout (dir + Readex Pro) and the home page
  src/app/globals.css         the eight tokens, mapped into shadcn variables
  src/messages/               ar.json, en.json
```

## Deferred from phase 1, on purpose

- **shadcn components are not installed.** `components.json` is configured and
  the theme variables are mapped, so `npx shadcn@latest add button card badge`
  works immediately. Installing thirty components before there's a screen that
  uses them produces a folder of dead code.
- **No sqlc output.** `sqlc.yaml` is wired and `make sqlc` runs, but there are no
  queries until phase 2 has tables.
- **No auth, no seed data, no unit pages.** Phase 2.
- **`go.sum` is not committed.** The Docker image runs `go mod tidy` on start.
  Commit the resulting `go.sum` after your first successful `make dev`.

## Notes on choices you might want to revisit

- **Tailwind v4** with CSS-first configuration, so the palette lives in
  `globals.css` and nowhere else. There is no `tailwind.config.ts`. If your team
  would rather have v3, the token block ports over to `theme.extend.colors`
  almost unchanged.
- **Locale prefix is `always`**, so the Arabic default sits at `/ar` rather than
  `/`. This keeps hreflang honest and avoids a duplicate-content root. If you
  want bare `/` to serve Arabic, switch `localePrefix` to `as-needed` in
  `src/i18n/routing.ts` and update the sitemap plan in phase 7.
- **The API talks to the browser over CORS from `localhost:3000`.** Phase 2
  should decide whether the Next.js server proxies the API instead, which would
  remove CORS entirely and let you keep the JWT in an httpOnly cookie.
