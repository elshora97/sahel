package unit

import "fmt"

type View string

const (
	ViewSea    View = "sea"
	ViewLagoon View = "lagoon"
	ViewPool   View = "pool"
	ViewGarden View = "garden"
	ViewStreet View = "street"
)

var AllViews = []View{ViewSea, ViewLagoon, ViewPool, ViewGarden, ViewStreet}

var validViewSet = func() map[View]bool {
	m := make(map[View]bool, len(AllViews))
	for _, v := range AllViews {
		m[v] = true
	}
	return m
}()

func (v View) Valid() bool    { return validViewSet[v] }
func (v View) String() string { return string(v) }

func ParseView(v string) (View, error) {
	vv := View(v)
	if !vv.Valid() {
		return "", fmt.Errorf("unknown view %q", v)
	}
	return vv, nil
}
