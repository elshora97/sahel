// Package area holds the area entity's enum values. It imports no database
// driver on purpose: everything here is a pure function over values, so the
// same constants can be used in HTTP handlers, tests, and the sqlc layer.
package area

import "fmt"

type Region string

const (
	RegionNorthCoast Region = "north_coast"
	RegionSokhna     Region = "sokhna"
	RegionGouna      Region = "gouna"
	RegionRasSudr    Region = "ras_sudr"
	RegionNewCairo   Region = "new_cairo"
)

// All is the canonical enum. Adding a value here requires a matching
// ALTER TYPE migration; the two must stay in lockstep.
var All = []Region{
	RegionNorthCoast,
	RegionSokhna,
	RegionGouna,
	RegionRasSudr,
	RegionNewCairo,
}

var validSet = func() map[Region]bool {
	m := make(map[Region]bool, len(All))
	for _, r := range All {
		m[r] = true
	}
	return m
}()

func (r Region) Valid() bool    { return validSet[r] }
func (r Region) String() string { return string(r) }

func ParseRegion(v string) (Region, error) {
	r := Region(v)
	if !r.Valid() {
		return "", fmt.Errorf("unknown region %q", v)
	}
	return r, nil
}
