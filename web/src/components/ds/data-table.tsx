import type { ReactNode } from "react";

/** Row and cell classes. A row is `relative` so its RowLink can cover it. */
export const rowCls =
  "relative border-b border-line last:border-b-0 hover:bg-sea-soft/60 focus-within:bg-sea-soft";
export const cellCls = "px-4 py-3 align-middle text-sm";

export function DataTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="border-b border-line px-4 py-2.5 text-start text-[13px] font-normal whitespace-nowrap text-ink-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-ink-muted">{children}</div>;
}
