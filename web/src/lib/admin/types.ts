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
  slug: string;
  title_ar: string;
  title_en: string;
  type: string;
  status: string;
  bedrooms: number;
  max_guests: number;
  updated_at: string;
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
