import type { ReactNode } from "react";

export function Section({
  title,
  lede,
  action,
  id,
  children,
}: {
  title: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="pb-section pb-reveal" id={id} style={{ scrollMarginTop: 96 }}>
      <div className="pb-section__head">
        <div>
          <h2 className="pb-section__title">{title}</h2>
          {lede && <p className="pb-section__lede">{lede}</p>}
        </div>
        {action && <div className="pb-section__more">{action}</div>}
      </div>
      {children}
    </section>
  );
}
