"use client";

import { useState } from "react";

import { buttonClass } from "@/components/ds/button";
import { GuestFlow } from "./guest-flow";

/** A button that opens the phone sign-in dialog; the page refreshes after. */
export function SignInPrompt({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={buttonClass("primary", "lg")} onClick={() => setOpen(true)}>
        {label}
      </button>
      <GuestFlow open={open} onClose={() => setOpen(false)} signedIn={false} />
    </>
  );
}
