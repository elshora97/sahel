package pricing

import (
	"testing"
	"time"

	"github.com/sahel/api/internal/money"
)

func d(s string) time.Time {
	t, err := time.Parse(DateLayout, s)
	if err != nil {
		panic(err)
	}
	return t
}

func season(id, start, end string, price int64, mut ...func(*Season)) Season {
	s := Season{ID: id, NameEn: id, Start: d(start), End: d(end), NightlyPrice: money.FromPounds(price), MinNights: 1}
	for _, m := range mut {
		m(&s)
	}
	return s
}

func byDate(days []Day) map[string]Day {
	m := map[string]Day{}
	for _, x := range days {
		m[x.Date.Format(DateLayout)] = x
	}
	return m
}

func TestGenerateCoversOnlySeasonDates(t *testing.T) {
	// 2027-06-01 is a Tuesday.
	days := Generate([]Season{season("s", "2027-06-02", "2027-06-03", 1000)}, d("2027-06-01"), d("2027-06-04"))
	if len(days) != 2 {
		t.Fatalf("want 2 days, got %d", len(days))
	}
	m := byDate(days)
	if _, ok := m["2027-06-01"]; ok {
		t.Error("uncovered date must produce no row")
	}
	if m["2027-06-02"].Price != money.FromPounds(1000) || m["2027-06-02"].SeasonID != "s" {
		t.Errorf("unexpected day %+v", m["2027-06-02"])
	}
}

func TestGenerateOverlapResolution(t *testing.T) {
	long := season("long", "2027-07-01", "2027-08-31", 1000)
	short := season("short", "2027-07-10", "2027-07-20", 2000)
	vip := season("vip", "2027-07-15", "2027-07-15", 3000, func(s *Season) { s.Priority = 5 })
	m := byDate(Generate([]Season{long, vip, short}, d("2027-07-09"), d("2027-07-16")))
	cases := map[string]string{"2027-07-09": "long", "2027-07-10": "short", "2027-07-15": "vip", "2027-07-16": "short"}
	for date, want := range cases {
		if got := m[date].SeasonID; got != want {
			t.Errorf("%s: want %s, got %s", date, want, got)
		}
	}
}

func TestGenerateWeekendUpliftRoundsUpToPound(t *testing.T) {
	// 10,050.50 EGP +15% = 11,558.075 → 11,559 EGP on Thu and Fri only.
	s := season("s", "2027-06-02", "2027-06-06", 0, func(s *Season) {
		s.NightlyPrice = 1005050
		s.UpliftPct = 15
	})
	m := byDate(Generate([]Season{s}, d("2027-06-02"), d("2027-06-06")))
	if got := m["2027-06-03"].Price; got != 1155900 { // Thursday
		t.Errorf("thursday: got %d", got)
	}
	if got := m["2027-06-04"].Price; got != 1155900 { // Friday
		t.Errorf("friday: got %d", got)
	}
	if got := m["2027-06-05"].Price; got != 1005050 { // Saturday: no uplift, no rounding
		t.Errorf("saturday: got %d", got)
	}
}

func TestGenerateCheckinDays(t *testing.T) {
	any := season("any", "2027-06-01", "2027-06-02", 1000)
	thuFri := season("tf", "2027-06-03", "2027-06-05", 1000, func(s *Season) { s.CheckinDays = []int{4, 5} })
	m := byDate(Generate([]Season{any, thuFri}, d("2027-06-01"), d("2027-06-05")))
	want := map[string]bool{"2027-06-01": true, "2027-06-02": true, "2027-06-03": true, "2027-06-04": true, "2027-06-05": false}
	for date, ok := range want {
		if m[date].AllowedCheckin != ok {
			t.Errorf("%s: allowed_checkin want %v", date, ok)
		}
	}
}
