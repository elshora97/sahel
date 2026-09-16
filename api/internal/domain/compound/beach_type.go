// Package compound holds the compound entity's enum values.
package compound

import "fmt"

type BeachType string

const (
	BeachTypeSea    BeachType = "sea"
	BeachTypeLagoon BeachType = "lagoon"
	BeachTypeBoth   BeachType = "both"
	BeachTypeNone   BeachType = "none"
)

var AllBeachTypes = []BeachType{
	BeachTypeSea,
	BeachTypeLagoon,
	BeachTypeBoth,
	BeachTypeNone,
}

var validBeachTypeSet = func() map[BeachType]bool {
	m := make(map[BeachType]bool, len(AllBeachTypes))
	for _, b := range AllBeachTypes {
		m[b] = true
	}
	return m
}()

func (b BeachType) Valid() bool    { return validBeachTypeSet[b] }
func (b BeachType) String() string { return string(b) }

func ParseBeachType(v string) (BeachType, error) {
	b := BeachType(v)
	if !b.Valid() {
		return "", fmt.Errorf("unknown beach type %q", v)
	}
	return b, nil
}
