package unit

import "fmt"

type Status string

const (
	StatusDraft    Status = "draft"
	StatusActive   Status = "active"
	StatusPaused   Status = "paused"
	StatusArchived Status = "archived"
)

var AllStatuses = []Status{StatusDraft, StatusActive, StatusPaused, StatusArchived}

var validStatusSet = func() map[Status]bool {
	m := make(map[Status]bool, len(AllStatuses))
	for _, s := range AllStatuses {
		m[s] = true
	}
	return m
}()

func (s Status) Valid() bool    { return validStatusSet[s] }
func (s Status) String() string { return string(s) }

func ParseStatus(v string) (Status, error) {
	s := Status(v)
	if !s.Valid() {
		return "", fmt.Errorf("unknown unit status %q", v)
	}
	return s, nil
}
