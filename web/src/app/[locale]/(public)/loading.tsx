/** Shown on public pages while the next one renders; /search has its own. */
export default function PublicLoading() {
  return (
    <div aria-busy="true" style={{ display: "grid", gap: 16, marginBlockStart: 32 }}>
      <div className="pb-skel" style={{ blockSize: 36, inlineSize: "min(360px, 70%)" }} />
      <div className="pb-skel" style={{ blockSize: "clamp(220px, 42vw, 480px)" }} />
      <div className="pb-skel" style={{ blockSize: 18, inlineSize: "80%" }} />
      <div className="pb-skel" style={{ blockSize: 18, inlineSize: "60%" }} />
    </div>
  );
}
