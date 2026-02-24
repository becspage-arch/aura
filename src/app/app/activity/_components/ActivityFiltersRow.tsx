// src/app/app/activity/_components/ActivityFiltersRow.tsx
"use client";

export type ActivityScope = "user" | "user+aura" | "all";

export function ActivityFiltersRow(props: {
  scope: ActivityScope;
  onScopeChange: (v: ActivityScope) => void;
  q: string;
  onQueryChange: (v: string) => void;
  onExport: () => void;
  loading?: boolean;
}) {
  const { scope, onScopeChange, q, onQueryChange, onExport, loading } = props;

  return (
    <div className="aura-row-between">
      <div className="aura-pill-group">
        <button
          type="button"
          className="aura-pill-toggle"
          aria-pressed={scope === "user"}
          onClick={() => onScopeChange("user")}
        >
          <span className="aura-pill-indicator" />
          User
        </button>

        <button
          type="button"
          className="aura-pill-toggle"
          aria-pressed={scope === "user+aura"}
          onClick={() => onScopeChange("user+aura")}
        >
          <span className="aura-pill-indicator" />
          User + Aura evaluations
        </button>

        <button
          type="button"
          className="aura-pill-toggle"
          aria-pressed={scope === "all"}
          onClick={() => onScopeChange("all")}
        >
          <span className="aura-pill-indicator" />
          Include system (no noise)
        </button>
      </div>

      <div className="aura-control-right">
        <input
          className="aura-input"
          style={{ width: 260 }}
          placeholder="Search activity…"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          disabled={!!loading}
        />

        <button
          type="button"
          className="aura-btn aura-btn-subtle"
          onClick={onExport}
          disabled={!!loading}
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
