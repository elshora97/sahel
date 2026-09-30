/** Shown in the dashboard's main area while the next screen renders; the sidebar stays. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <div className="grid gap-2">
        <div className="pb-skel h-9 w-48 max-w-[70%]" />
        <div className="pb-skel h-4 w-24" />
      </div>
      <div className="pb-skel h-11 w-full max-w-md" />
      <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="pb-skel h-10 w-14 shrink-0" />
            <div className="grid flex-1 gap-2">
              <div className="pb-skel h-4 w-2/3" />
              <div className="pb-skel h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
