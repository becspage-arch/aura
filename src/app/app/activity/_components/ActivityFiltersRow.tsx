// src/app/app/activity/_components/ActivityFiltersRow.tsx
"use client";

export type ActivityScope = "user" | "user+aura" | "all";
export type SystemPreset = "important" | "errors" | "settings" | "all";

export function ActivityFiltersRow(props: {
  scope: ActivityScope;
  onScopeChange: (v: ActivityScope) => void;

  systemPreset: SystemPreset;
  onSystemPresetChange: (v: SystemPreset) => void;

  q: string;
  onQueryChange: (v: string) => void;

  onExport: () => void;
  loading?: boolean;
}) {
  const {
    scope,
    onScopeChange,
    systemPreset,
    onSystemPresetChange,
    q,
    onQueryChange,
    onExport,
    loading,
  } = props;

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

        {scope === "all" ? (
          <>
            <span className="aura-muted aura-text-xs">|</span>

            <button
              type="button"
              className="aura-pill-toggle"
              aria-pressed={systemPreset === "important"}
              onClick={() => onSystemPresetChange("important")}
            >
              <span className="aura-pill-indicator" />
              Important
            </button>

            <button
              type="button"
              className="aura-pill-toggle"
              aria-pressed={systemPreset === "errors"}
              onClick={() => onSystemPresetChange("errors")}
            >
              <span className="aura-pill-indicator" />
              Errors only
            </button>

            <button
              type="button"
              className="aura-pill-toggle"
              aria-pressed={systemPreset === "settings"}
              onClick={() => onSystemPresetChange("settings")}
            >
              <span className="aura-pill-indicator" />
              Settings
            </button>

            <button
              type="button"
              className="aura-pill-toggle"
              aria-pressed={systemPreset === "all"}
              onClick={() => onSystemPresetChange("all")}
            >
              <span className="aura-pill-indicator" />
              All
            </button>
          </>
        ) : null}
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
