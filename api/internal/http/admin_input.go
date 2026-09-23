package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sahel/api/internal/slug"
)

// field is one member of an admin POST/PATCH body. Plain pointers can't tell
// "key absent" (leave the column alone) from "key: null" (clear the column);
// field can. Set means the key was present; Null means its value was null.
type field[T any] struct {
	Set  bool
	Null bool
	V    T
}

func (f *field[T]) UnmarshalJSON(b []byte) error {
	f.Set = true
	if string(b) == "null" {
		f.Null = true
		return nil
	}
	return json.Unmarshal(b, &f.V)
}

// problems collects every validation failure so the admin sees them all at
// once instead of fixing one per round-trip.
type problems []string

func (p *problems) add(format string, args ...any) {
	*p = append(*p, fmt.Sprintf(format, args...))
}

func (p problems) err() error {
	if len(p) == 0 {
		return nil
	}
	return errors.New(strings.Join(p, "; "))
}

// setField copies a present value into a NOT NULL column.
func setField[T any](p *problems, dst *T, f field[T], name string) {
	if !f.Set {
		return
	}
	if f.Null {
		p.add("%s cannot be null", name)
		return
	}
	*dst = f.V
}

// setNullable copies a present value, or an explicit null, into a nullable column.
func setNullable[T any](dst **T, f field[T]) {
	if !f.Set {
		return
	}
	if f.Null {
		*dst = nil
		return
	}
	v := f.V
	*dst = &v
}

// setCoord writes a latitude/longitude into a NUMERIC(9,6) column,
// rejecting values outside ±limit.
func setCoord(p *problems, dst *pgtype.Numeric, f field[float64], name string, limit float64) {
	if !f.Set {
		return
	}
	if f.Null {
		*dst = pgtype.Numeric{}
		return
	}
	if f.V < -limit || f.V > limit {
		p.add("%s must be between %g and %g", name, -limit, limit)
		return
	}
	var n pgtype.Numeric
	if err := n.Scan(strconv.FormatFloat(f.V, 'f', 6, 64)); err != nil {
		p.add("%s: %v", name, err)
		return
	}
	*dst = n
}

// requirePair checks both halves of a bilingual NOT NULL pair, naming the
// missing side so an untranslated field is obvious.
func requirePair(p *problems, name string, ar, en string) {
	requireText(p, name+"_ar", ar)
	requireText(p, name+"_en", en)
}

// requireText checks a single NOT NULL text column.
func requireText(p *problems, name, v string) {
	if strings.TrimSpace(v) == "" {
		p.add("%s is required", name)
	}
}

// requireSet flags a create-time field that has no sensible zero value.
func requireSet(p *problems, name string, set bool) {
	if !set {
		p.add("%s is required", name)
	}
}

// checkEnum reports an empty or unknown enum value. valid comes from the
// matching internal/domain type so the DB enum and Go stay in lockstep.
func checkEnum(p *problems, name, v string, valid bool) {
	switch {
	case v == "":
		p.add("%s is required", name)
	case !valid:
		p.add("%s: unknown value %q", name, v)
	}
}

// trimAll trims whitespace from each string in place.
func trimAll(ss ...*string) {
	for _, s := range ss {
		*s = strings.TrimSpace(*s)
	}
}

// blankToNil trims a nullable text column and stores blanks as NULL, so ""
// and null mean the same thing to every reader.
func blankToNil(s **string) {
	if *s == nil {
		return
	}
	v := strings.TrimSpace(**s)
	if v == "" {
		*s = nil
		return
	}
	*s = &v
}

// normalizeAmenities trims, drops blanks and duplicates, keeps first-seen
// order, and never returns nil (the column is TEXT[] NOT NULL).
func normalizeAmenities(in []string) []string {
	out := make([]string, 0, len(in))
	seen := make(map[string]bool, len(in))
	for _, a := range in {
		a = strings.TrimSpace(a)
		if a == "" || seen[a] {
			continue
		}
		seen[a] = true
		out = append(out, a)
	}
	return out
}

// checkSlug requires a slug already in canonical form.
func checkSlug(s string) error {
	if s == "" || slug.Make(s) != s {
		return fmt.Errorf("slug %q must be lowercase letters, digits and single hyphens (try %q)", s, slug.Make(s))
	}
	return nil
}

// resolveSlug returns the slug to insert on create. An admin-supplied slug
// must be canonical and is used verbatim (explicit=true); otherwise one is
// derived from source (the English name/title).
func resolveSlug(given, source string) (s string, explicit bool, err error) {
	if given != "" {
		return given, true, checkSlug(given)
	}
	derived := slug.Make(source)
	if derived == "" {
		return "", false, errors.New("slug could not be derived from the English name; provide one")
	}
	return derived, false, nil
}

// decodeJSON reads a JSON body of at most 1 MB into dst, rejecting unknown
// keys so typos ("titel_en") fail loudly instead of being dropped.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return false
	}
	return true
}

func writeInvalid(w http.ResponseWriter, err error) {
	writeError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
}

// queryOpt returns a query parameter, or nil when it's absent or empty.
func queryOpt(r *http.Request, name string) *string {
	if v := r.URL.Query().Get(name); v != "" {
		return &v
	}
	return nil
}
