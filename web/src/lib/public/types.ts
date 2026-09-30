/** Shapes of the Go public API (/api/v1, no auth). */

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface AreaSummary {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  region: string;
  km_marker: number | null;
  sort_order: number;
  unit_count: number;
}

export interface CompoundSummary {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  amenities: string[] | null;
  beach_type: string;
  cover_image_url: string | null;
  is_featured: boolean;
  area_slug?: string;
}

export interface AreaDetail extends Omit<AreaSummary, "unit_count"> {
  featured_compounds: CompoundSummary[];
}

/** A unit in a list: search rows carry names and area; compound rows don't. */
export interface UnitCardData {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  sea_distance_m: number;
  view: string;
  cover_url: string | null;
  /** Lowest future available nightly price in piasters; 0 when unpriced. */
  from_price?: number;
  compound_slug?: string;
  compound_name_ar?: string;
  compound_name_en?: string;
  area_slug?: string;
  area_name_ar?: string;
  area_name_en?: string;
}

export interface CompoundDetail extends CompoundSummary {
  gate_info_ar: string | null;
  gate_info_en: string | null;
  area: { slug: string; name_ar: string; name_en: string };
  units: Page<UnitCardData>;
}

export interface UnitImage {
  id: string;
  url: string;
  alt_ar: string | null;
  alt_en: string | null;
  sort: number;
  is_cover: boolean;
}

export interface UnitDetail {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  house_rules_ar: string | null;
  house_rules_en: string | null;
  type: string;
  bedrooms: number;
  bathrooms: number;
  base_guests: number;
  max_guests: number;
  area_sqm: number | null;
  floor: number | null;
  sea_distance_m: number;
  view: string;
  row_number: number | null;
  amenities: string[] | null;
  lat: number | null;
  lng: number | null;
  compound: { id: string; slug: string; name_ar: string; name_en: string };
  area: { id: string; slug: string; name_ar: string; name_en: string };
  images: UnitImage[];
}

export interface AvailabilityDay {
  date: string;
  price: number | null;
  state: "free" | "blocked" | "past";
}

export interface QuoteBreakdown {
  nightly_price: number;
  night_count: number;
  total: number;
  deposit_due: number;
}

export type QuoteResult = { ok: true; quote: QuoteBreakdown } | { ok: false; code: string };

export interface Customer {
  id: string;
  phone: string;
  name: string;
}

export interface BookingView {
  id: string;
  ref: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  status: string;
  nightly_price: number;
  total: number;
  deposit_due: number;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  customer_id: string;
  hold_expires_at: string | null;
  paid_total: number;
  payment_rejection_count: number;
  unit_slug: string;
  unit_title_ar: string;
  unit_title_en: string;
  compound_name_ar: string;
  compound_name_en: string;
  customer_name: string;
  customer_phone: string;
  cover_url: string | null;
}

export interface MyBooking {
  id: string;
  ref: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  status: string;
  total: number;
  created_at: string;
  unit_slug: string;
  unit_title_ar: string;
  unit_title_en: string;
  cover_url: string | null;
}

export interface GuestPayment {
  status: "pending" | "verified" | "rejected";
  amount: number;
  rejection_reason: string | null;
  created_at: string;
}

export interface GuestBooking extends BookingView {
  payments: GuestPayment[];
  instapay: { address: string; mobile: string; holder_name: string };
}
