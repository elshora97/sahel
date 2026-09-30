/** Shapes returned by /api/v1/admin/*. Numeric(9,6) columns arrive as numbers. */

export interface Area {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  region: string;
  km_marker: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Compound {
  id: string;
  area_id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  amenities: string[];
  beach_type: string;
  gate_info_ar: string | null;
  gate_info_en: string | null;
  lat: number | null;
  lng: number | null;
  cover_image_url: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompoundRow extends Compound {
  area_name_ar: string;
  area_name_en: string;
}

export interface Owner {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  national_id: string | null;
  notes: string | null;
  commission_pct: number;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  id: string;
  owner_id: string;
  compound_id: string;
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
  amenities: string[];
  lat: number | null;
  lng: number | null;
  exact_address: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  /** Pricing; money in piasters. A null nightly price means not bookable yet. */
  nightly_price: number | null;
  buffer_days: number;
  advance_notice_hours: number;
  max_advance_days: number;
}

export interface UnitImage {
  id: string;
  unit_id: string;
  url: string;
  alt_ar: string | null;
  alt_en: string | null;
  sort: number;
  is_cover: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnitDetail extends Unit {
  images: UnitImage[];
}

export interface UnitRow {
  id: string;
  compound_id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  type: string;
  status: string;
  bedrooms: number;
  max_guests: number;
  sea_distance_m: number;
  updated_at: string;
  /** Piasters, or null when the unit has no price yet. */
  nightly_price: number | null;
  compound_name_ar: string;
  compound_name_en: string;
  owner_name: string;
  cover_url: string | null;
}

export interface Enums {
  region: string[];
  beach_type: string[];
  type: string[];
  view: string[];
  unit_status: string[];
}

/** What a form Server Action hands back to its form: nothing, or a banner. */
export type FormState = { error: string } | null;
export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

export interface BookingRow {
  id: string;
  ref: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  status: string;
  total: number;
  created_at: string;
  unit_id: string;
  unit_title_ar: string;
  unit_title_en: string;
  compound_name_ar: string;
  compound_name_en: string;
  deposit_due: number;
  paid_total: number;
  source: string;
  customer_name: string;
  customer_phone: string;
}

export interface PaymentRow {
  id: string;
  status: "pending" | "verified" | "rejected";
  amount: number;
  sender_name: string;
  sender_number: string;
  rejection_reason: string | null;
  recorded_by: "guest" | "admin";
  created_at: string;
  verified_at: string | null;
  has_proof: boolean;
  proof_type: string | null;
  booking_id: string;
  ref: string;
  booking_status: string;
  deposit_due: number;
  paid_total: number;
  total: number;
  check_in: string;
  check_out: string;
  unit_title_ar: string;
  unit_title_en: string;
  customer_name: string;
  customer_phone: string;
}

export interface BookingPayment {
  id: string;
  status: "pending" | "verified" | "rejected";
  amount: number;
  sender_name: string;
  sender_number: string;
  rejection_reason: string | null;
  notes: string | null;
  recorded_by: "guest" | "admin";
  verified_at: string | null;
  created_at: string;
  has_proof: boolean;
}

export interface InstapayAccount {
  address: string;
  mobile: string;
  holder_name: string;
}

/** GET /admin/timeline */
export type TimelineBooking = { id: string; ref: string; status: string; check_in: string; check_out: string; customer_name: string };
export type TimelineBlock = { id: string; unit_id: string; start: string; end: string; note: string };
export type TimelineUnit = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  status: string;
  compound_name_ar: string;
  compound_name_en: string;
  bookings: TimelineBooking[];
  blocks: TimelineBlock[];
};
export type Timeline = { from: string; days: number; today: string; units: TimelineUnit[] };

/** GET /admin/today */
export type Movement = {
  id: string;
  ref: string;
  status: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  customer_name: string;
  customer_phone: string;
  unit_id: string;
  unit_title_ar: string;
  unit_title_en: string;
};
export type Today = {
  today: string;
  arrivals: Movement[];
  departures: Movement[];
  staying_tonight: number;
  holds_expiring: number;
  active_units: number;
  occupied_nights: number;
  week_nights: number;
};

/** GET /admin/customers */
export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  bookings: number;
  stays: number;
  paid_total: number;
  last_booked_at: string | null;
};

/** GET /admin/reports?year= (money in piasters) */
export type ReportMonth = {
  month: string;
  nights: number;
  revenue: number;
  blocked_nights: number;
  available_nights: number;
  collected: number;
  bookings_made: number;
};
export type ReportUnit = {
  id: string;
  title_ar: string;
  title_en: string;
  status: string;
  nights: number;
  revenue: number;
  blocked_nights: number;
  available_nights: number;
};
export type Report = { year: number; today: string; active_units: number; months: ReportMonth[]; units: ReportUnit[] };

/** GET /admin/customers/{id} */
export type Customer = { id: string; name: string; phone: string; email: string | null; created_at: string; has_password: boolean };
