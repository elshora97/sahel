import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

/** Classes for the system's Button; also used on links that look like buttons. */
export function buttonClass(variant: Variant = "secondary", size: Size = "md", block = false): string {
  return cn("bs-btn", `bs-btn--${variant}`, `bs-btn--${size}`, block && "bs-btn--block");
}

/**
 * Beet Elsahel Button. `primary` once per view: the action that moves the
 * record forward. `danger` only for deletes. Labels are verb phrases, no arrows.
 */
export function Button({
  variant,
  size,
  block,
  className,
  ...rest
}: { variant?: Variant; size?: Size; block?: boolean } & ComponentProps<"button">) {
  return <button type="button" {...rest} className={cn(buttonClass(variant, size, block), className)} />;
}
