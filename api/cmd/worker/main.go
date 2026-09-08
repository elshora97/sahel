package main

import (
	"fmt"
	"os"
)

// The worker owns hold expiry, the WhatsApp and SMS queue, and image
// processing. Nothing is queued until phase 4, so this is a deliberate stub
// rather than an empty scheduler loop that looks like it works.
func main() {
	fmt.Fprintln(os.Stdout, "worker: nothing to run until phase 4 (hold expiry)")
}
