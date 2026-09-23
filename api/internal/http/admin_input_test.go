package http

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestField_AbsentNullValue(t *testing.T) {
	var in struct {
		A field[int32]  `json:"a"`
		B field[int32]  `json:"b"`
		C field[string] `json:"c"`
	}
	if err := json.Unmarshal([]byte(`{"b": null, "c": "x"}`), &in); err != nil {
		t.Fatal(err)
	}
	if in.A.Set {
		t.Error("a: absent key must not be Set")
	}
	if !in.B.Set || !in.B.Null {
		t.Errorf("b: want Set+Null, got %+v", in.B)
	}
	if !in.C.Set || in.C.Null || in.C.V != "x" {
		t.Errorf("c: want value x, got %+v", in.C)
	}
}

func TestSetters(t *testing.T) {
	var p problems
	name := "old"
	setField(&p, &name, field[string]{Set: true, V: "new"}, "name")
	setField(&p, &name, field[string]{}, "name") // absent: unchanged
	if name != "new" {
		t.Errorf("name = %q", name)
	}
	setField(&p, &name, field[string]{Set: true, Null: true}, "name")
	if len(p) != 1 || !strings.Contains(p[0], "name cannot be null") {
		t.Errorf("problems = %v", p)
	}

	km := new(int32)
	setNullable(&km, field[int32]{Set: true, Null: true})
	if km != nil {
		t.Error("explicit null must clear a nullable column")
	}
	setNullable(&km, field[int32]{Set: true, V: 7})
	if km == nil || *km != 7 {
		t.Errorf("km = %v", km)
	}
}

func TestSetCoord(t *testing.T) {
	var p problems
	n := mustNumeric(t, "1")
	setCoord(&p, &n, field[float64]{Set: true, V: 31.123456}, "lat", 90)
	if got, _ := n.Float64Value(); got.Float64 != 31.123456 {
		t.Errorf("lat = %v", got)
	}
	setCoord(&p, &n, field[float64]{Set: true, V: 91}, "lat", 90)
	if len(p) != 1 {
		t.Errorf("want out-of-range problem, got %v", p)
	}
	setCoord(&p, &n, field[float64]{Set: true, Null: true}, "lat", 90)
	if n.Valid {
		t.Error("null must clear the coordinate")
	}
}

func TestRequirePair(t *testing.T) {
	var p problems
	requirePair(&p, "title", "عنوان", "  ")
	if !reflect.DeepEqual([]string(p), []string{"title_en is required"}) {
		t.Errorf("problems = %v", p)
	}
}

func TestCheckEnum(t *testing.T) {
	var p problems
	checkEnum(&p, "type", "", false)
	checkEnum(&p, "view", "moon", false)
	checkEnum(&p, "view", "sea", true)
	want := []string{"type is required", `view: unknown value "moon"`}
	if !reflect.DeepEqual([]string(p), want) {
		t.Errorf("problems = %v", p)
	}
}

func TestNormalizeAmenities(t *testing.T) {
	got := normalizeAmenities([]string{" pool ", "", "pool", "beach", "  "})
	if !reflect.DeepEqual(got, []string{"pool", "beach"}) {
		t.Errorf("got %v", got)
	}
	if got := normalizeAmenities(nil); got == nil || len(got) != 0 {
		t.Errorf("nil input must become an empty, non-nil slice; got %#v", got)
	}
}

func TestBlankToNil(t *testing.T) {
	s := "   "
	p := &s
	blankToNil(&p)
	if p != nil {
		t.Error("blank must become nil")
	}
	v := " keep "
	p = &v
	blankToNil(&p)
	if p == nil || *p != "keep" {
		t.Errorf("want trimmed value, got %v", p)
	}
}

func TestCheckSlug(t *testing.T) {
	for s, ok := range map[string]bool{"marassi": true, "sidi-abdel-rahman": true, "": false, "Marassi": false, "a b": false, "-x": false} {
		if err := checkSlug(s); (err == nil) != ok {
			t.Errorf("checkSlug(%q) err=%v, want ok=%v", s, err, ok)
		}
	}
}

func TestResolveSlug(t *testing.T) {
	s, explicit, err := resolveSlug("", "Sidi Abdel Rahman")
	if err != nil || s != "sidi-abdel-rahman" || explicit {
		t.Errorf("derived: %q %v %v", s, explicit, err)
	}
	s, explicit, err = resolveSlug("custom-one", "ignored")
	if err != nil || s != "custom-one" || !explicit {
		t.Errorf("explicit: %q %v %v", s, explicit, err)
	}
	if _, _, err := resolveSlug("", "!!!"); err == nil {
		t.Error("want error when nothing can be derived")
	}
}
