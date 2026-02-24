// src/app/app/activity/_components/ActivityFiltersRow.tsx
"use client";

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function pill(label: string) {
  return (
    <span
      className="aura-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        fontSize: 12,
      }}
    >
      {label}
    </span>
  );
}

export function ActivityItemRow(props: { item: any }) {
  const it = props.item || {};
  const kind = String(it.kind || "");

  const createdAt = String(it.createdAt || "");
  const title = String(it.title || "");
  const summary = String(it.summary || "");
  const details = it.details ?? null;

  const rightBadges: React.ReactNode[] = [];

  if (kind === "system_event") {
    const lvl = String(it.level || "info").toLowerCase();
    const type = String(it.type || "");
    if (type) rightBadges.push(pill(type));
    if (lvl && lvl !== "info") rightBadges.push(pill(lvl.toUpperCase()));
  }

  if (kind === "aura_eval") {
    const status = String(it.status || "");
    const side = String(it.side || "");
    const symbol = String(it.symbol || "");
    if (symbol) rightBadges.push(pill(symbol));
    if (side) rightBadges.push(pill(side));
    if (status) rightBadges.push(pill(status));
    if (it.blockReason) rightBadges.push(pill(String(it.blockReason)));
  }

  return (
    <div className="aura-card aura-card--subtle">
      <div className="aura-row-between">
        <div>
          <div className="aura-text-sm" style={{ fontWeight: 600 }}>
            {title}
          </div>
          <div className="aura-muted aura-text-xs">{createdAt ? fmtTime(createdAt) : ""}</div>
        </div>

        <div className="aura-row-gap-8" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {rightBadges.length ? rightBadges : null}
        </div>
      </div>

      {summary ? <div className="aura-mt-8 aura-text-sm">{summary}</div> : null}

      {details ? (
        <details className="aura-mt-8">
          <summary className="aura-muted aura-text-xs" style={{ cursor: "pointer" }}>
            Details
          </summary>
          <pre
            className="aura-mt-8"
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 12,
              opacity: 0.9,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            {JSON.stringify(details, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
