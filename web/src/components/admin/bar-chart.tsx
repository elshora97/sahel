/**
 * A single-series column chart in plain HTML, so it follows the page
 * direction (months run right to left in Arabic). One hue, thin columns with
 * rounded tops on a baseline, a recessive grid, and a tooltip on hover or
 * keyboard focus. The caller supplies a table view of the same numbers.
 */
export function BarChart({
  label,
  bars,
  max,
  ticks,
}: {
  /** Names the chart for screen readers. */
  label: string;
  bars: Array<{ key: string; label: string; value: number; display: string; current?: boolean }>;
  /** The top of the scale; bars are drawn relative to it. */
  max: number;
  /** Grid lines from the baseline up, already formatted. */
  ticks: Array<{ value: number; display: string }>;
}) {
  const top = max > 0 ? max : 1;
  return (
    <figure className="bc m-0" aria-label={label}>
      <div className="bc-plot">
        {ticks.map((t) => (
          <div key={t.value} className="bc-grid" style={{ insetBlockEnd: `${(t.value / top) * 100}%` }}>
            <span className="bc-tick num">{t.display}</span>
          </div>
        ))}
        <div className="bc-bars">
          {bars.map((b) => (
            <div key={b.key} className="bc-slot" tabIndex={0} aria-label={`${b.label}: ${b.display}`} data-current={b.current || undefined}>
              <div className="bc-bar" style={{ blockSize: `${Math.max((b.value / top) * 100, b.value > 0 ? 1.5 : 0)}%` }} />
              <span className="bc-tip num" role="tooltip">
                <span className="block text-ink-muted">{b.label}</span>
                {b.display}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bc-axis" aria-hidden="true">
        {bars.map((b) => (
          <span key={b.key} data-current={b.current || undefined}>
            {b.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
