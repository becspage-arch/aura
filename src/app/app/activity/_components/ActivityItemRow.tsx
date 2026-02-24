// src/app/app/activity/_components/ActivityItemRow.tsx
"use client";

type ActivityItem =
  | {
      kind: "user_action";
      id: string;
      createdAt: string;
      title: string;
      summary: string;
      details: any | null;
    }
  | {
      kind: "aura_eval";
      id: string;
      createdAt: string;
      title: string;
      summary: string;
      details: any | null;
      symbol: string;
      side: "BUY" | "SELL";
      status: "DETECTED" | "BLOCKED" | "TAKEN";
      blockReason: string | null;
    }
  | {
      kind: "system_event";
      id: string;
      createdAt: string;
      title: string;
      summary: string;
      details: any | null;
      level: string;
      type: string;
    };

function safeJsonString(v: any) {
  try {
    if (v == null) return "";
    return JSON.stringify(v, null, 2);
  } catch {
    return "";
  }
}

function pillFor(item: ActivityItem) {
  if (item.kind === "user_action") return <span className="aura-pill">User</span>;
  if (item.kind === "aura_eval") {
    if (item.status === "TAKEN") return <span className="aura-pill">Entered</span>;
    if (item.status === "BLOCKED") return <span className="aura-pill">Skipped</span>;
    return <span className="aura-pill">Detected</span>;
  }
  return <span className="aura-pill">System</span>;
}

function rightFor(item: ActivityItem) {
  if (item.kind === "system_event") {
    return <span className="aura-muted aura-text-xs">{String(item.level).toUpperCase()}</span>;
  }
  if (item.kind === "aura_eval") {
    return <span className="aura-muted aura-text-xs">{item.side}</span>;
  }
  return <span className="aura-muted aura-text-xs">—</span>;
}

export function ActivityItemRow({ item }: { item: ActivityItem }) {
  return (
    <details className="aura-table aura-card-muted aura-details">
      <summary className="aura-control-row aura-row-link aura-summary" style={{ padding: 12 }}>
        <div className="aura-control-meta">
          <div className="aura-control-title">{item.title}</div>
          <div className="aura-control-help">
            {new Date(item.createdAt).toLocaleString()} •{" "}
            <span className="aura-muted">{item.summary || "—"}</span>
          </div>
        </div>

        <div className="aura-control-right">
          {pillFor(item)}
          {rightFor(item)}
        </div>
      </summary>

      <div className="aura-expand">
        <pre className="aura-card-muted aura-text-xs" style={{ margin: 0 }}>
{safeJsonString(item.details)}
        </pre>
      </div>
    </details>
  );
}
