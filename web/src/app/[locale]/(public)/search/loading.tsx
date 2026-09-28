/** Shown on a first visit to /search while the server renders results. */
export default function SearchLoading() {
  return (
    <div aria-busy="true" style={{ marginBlockStart: 32 }}>
      <div className="pb-skel" style={{ blockSize: 52, inlineSize: "min(420px, 80%)" }} />
      <div className="pb-search-layout">
        <div className="pb-skel" style={{ blockSize: 520 }} />
        <div className="pb-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={{ display: "grid", gap: 12 }}>
              <div className="pb-skel" style={{ aspectRatio: "4 / 3" }} />
              <div className="pb-skel" style={{ blockSize: 22, inlineSize: "70%" }} />
              <div className="pb-skel" style={{ blockSize: 16, inlineSize: "50%" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
