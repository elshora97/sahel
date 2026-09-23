"use client";

import type { UnitImage } from "@/lib/admin/types";

export function ImageManager({ images }: { unitId: string; images: UnitImage[] }) {
  return <p className="text-sm text-ink-muted">{images.length}</p>;
}
