// Package unit holds the unit entity's enum values.
package unit

import "fmt"

type Type string

const (
	TypeChalet    Type = "chalet"
	TypeVilla     Type = "villa"
	TypeTwin      Type = "twin"
	TypeTown      Type = "town"
	TypePenthouse Type = "penthouse"
	TypeStudio    Type = "studio"
	TypeApartment Type = "apartment"
)

var AllTypes = []Type{
	TypeChalet, TypeVilla, TypeTwin, TypeTown,
	TypePenthouse, TypeStudio, TypeApartment,
}

var validTypeSet = func() map[Type]bool {
	m := make(map[Type]bool, len(AllTypes))
	for _, t := range AllTypes {
		m[t] = true
	}
	return m
}()

func (t Type) Valid() bool    { return validTypeSet[t] }
func (t Type) String() string { return string(t) }

func ParseType(v string) (Type, error) {
	t := Type(v)
	if !t.Valid() {
		return "", fmt.Errorf("unknown unit type %q", v)
	}
	return t, nil
}
