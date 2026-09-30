# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Guests.** Egyptian families, plus friend groups and couples, renting a chalet or villa on the North Coast (Sahel) for a summer week or a weekend. They are price-sensitive, Arabic-first, mostly on phones, and used to arranging rentals over WhatsApp. Their job: find a unit in the compound they want, at the distance from the sea they can afford, on dates that are actually free, and pay without getting scammed.

**The operator.** The owner of the business runs the whole dashboard alone, on a laptop and a phone. Their jobs: keep calendars and seasonal prices right, verify InstaPay/bank-transfer proofs against expected amounts, confirm bookings and send vouchers, and see today's arrivals, departures and payments at a glance.

Staff/agent and owner roles exist in the spec (owner portal is phase 8) but no one uses them today.

## Product Purpose

Beet Elsahel is a direct booking site for vacation rentals the operator lists and manages, on the Egyptian North Coast first, later Ain Sokhna, Gouna, Ras Sudr and New Cairo. Guests browse units, see real availability, request a booking that holds the dates, pay off-platform, upload proof, and get a confirmed voucher. Success means guests book without a WhatsApp back-and-forth about availability, and the operator reconciles payments in minutes instead of chasing screenshots.

## Positioning

- **Real availability.** A live calendar shows free, held and booked dates, so "is it free?" never needs to be asked.
- **Trust and verification.** Units are listed directly by the operator. Every payment follows a visible trail: reference → proof → verification → voucher.
- **Sea-first search.** People choose by compound, distance to the sea, view and row. These are structured, filterable fields, not free text.
- **Direct, no middleman.** The operator owns or manages the units, so prices and answers come straight from them, unlike Facebook brokers or Airbnb.

## Operating Context

- Rentals come in blocks (weekend Thu→Sun, short weekend Thu→Sat, midweek Sun→Thu, full week Fri→Fri). Each unit sets `min_nights` and allowed check-in days per season. Prices are set per date, and peak August is many times the price of the off season.
- Compounds (Marassi, Hacienda Bay, Telal, Almaza Bay, Marina…) are first-class: guests search by compound name.
- Payment is **assisted manual reconciliation**. Guests pay by InstaPay or bank transfer outside the app, using a `MRS-XXXXX` Crockford-base32 reference and an exact amount with a distinctive suffix. They upload a screenshot and the operator verifies it. Mobile wallets are deliberately not supported.
- Dates are held for a limited time while payment is pending, with an honest countdown on the booking page.
- `/booking/[ref]` works without an account; guests reach it from WhatsApp links. Guests sign in by phone + OTP.
- A confirmed booking produces a voucher. There is no contract. The tenant's national ID is collected for the compound gate list.

## Capabilities and Constraints

- Stack: Next.js 15 (App Router, next-intl, Tailwind v4 CSS-first tokens, shadcn-style primitives in `web/src/components/ds`) with a Go 1.23 API and PostgreSQL 16. Money is integer piasters.
- Arabic is the default locale (RTL) and English is a toggle. Layout uses logical CSS properties only, so RTL is a mirror rather than a branch. Prices use Western numerals by default.
- Built so far (phases 1–6): catalog (areas, compounds, units, photos), availability and seasonal pricing, the booking hold flow, InstaPay payments with proof upload and a verification queue, the dashboard (today view, units timeline, date blocks, manual bookings, customers, owners, reports), and unit location maps.
- Privacy: exact addresses and owner details are admin-only. The public map shows an offset pin until a booking is confirmed. Payment proofs are served through signed URLs.
- `01-design-and-requirements.md` is the spec of record and `DECISIONS.md` records overrides. Booking-status and money rules must not change without reading both.
- Undecided: phase 7 polish (SEO, PDF vouchers, WhatsApp templates, Arabic copy review) and phase 8 (owner portal, PSP integration, iCal sync, reviews).

## Brand Commitments

- Name: **Beet Elsahel / بيت الساحل** (final). There is no logo asset yet.
- Voice: Egyptian colloquial Arabic, warm and direct (e.g. "صيفك على الساحل يبدأ من هنا"), factual about prices and dates.
- Existing visual direction lives in `01-design-and-requirements.md` §4 and `web/src/app/globals.css`. It is recorded there, not here.

## Evidence on Hand

- Real product copy in `web/src/messages/{ar,en}.json` and `web/src/messages/admin/`.
- An Arabic user manual for the operator: `docs/user-manual-ar.md`.
- No testimonials, reviews, guest counts, press or ratings exist yet. Do not fabricate them. Reviews are a phase-8 feature.
- Unit photography comes from the operator's uploads. Do not invent stock imagery or claims about units.

## Product Principles

1. **Availability is the product.** Free, held and booked dates must be visible and unambiguous everywhere a guest decides.
2. **Money is exact and legible.** Every amount shows its season context and tabular digits. The amount to send, the reference and the deadline can never be misread.
3. **Earn trust through a visible trail.** Every step from request to voucher tells guests where they stand and what happens next, with no dead ends.
4. **Arabic first, mirrored, never translated as an afterthought.** RTL is the primary experience, and English is its mirror.
5. **One operator, zero wasted clicks.** Dashboard flows are built for one person verifying and confirming quickly, often on a phone.

## Accessibility & Inclusion

- Mobile-first for guests: most arrive from WhatsApp on phones, sometimes on slow connections.
- Full RTL correctness, with Arabic typography that is as legible as the Latin.
- Booking states must never be shown by colour alone; each state is also labelled.
