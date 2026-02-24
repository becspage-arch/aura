// src/app/app/activity/_components/ActivityFiltersRow.tsx
"use client";

export type SystemPreset = "important" | "errors" | "settings" | "all";

export type TimePreset = "today" | "yesterday" | "last7" | "last30" | "custom";

export function ActivityFiltersRow(props: {
  // Checkboxes
  includeMyActivity: boolean;
  onIncludeMyActivityChange: (v: boolean) => void;

  includeTradeDecisions: boolean;
  onIncludeTradeDecisionsChange: (v: boolean) => void;

  includeAccountSystem: boolean;
  onIncludeAccountSystemChange: (v: boolean) => void;

  // System preset
  systemPreset: SystemPreset;
  onSystemPresetChange: (v: SystemPreset) => void;

  // Time
  timePreset: TimePreset;
  onTimePresetChange: (v: TimePreset) => void;

  customFrom: string; // ISO-local-ish string for input
  onCustomFromChange: (v: string) => void;

  customTo: string;
  onCustomToChange: (v: string) => void;

  // Search + export
  q: string;
  onQueryChange: (v: string) => void;

  onExport: () => void;
  loading?: boolean;
}) {
  const {
    includeMyActivity,
    onIncludeMyActivityChange,
    includeTradeDecisions,
    onIncludeTradeDecisionsChange,
    includeAccountSystem,
    onIncludeAccountSystemChange,
    systemPreset,
    onSystemPresetChange,
    timePreset,
    onTimePresetChange,
    customFrom,
    onCustomFromChange,
    customTo,
    onCustomToChange,
    q,
    onQueryChange,
    onExport,
    loading,
  } = props;

  return (
    <div className="aura-grid-gap-12">
      <div className="aura-row-between">
        <div className="aura-pill-group">
          <label className="aura-pill-toggle" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={includeMyActivity}
              onChange={(e) => onIncludeMyActivityChange(e.target.checked)}
              disabled={!!loading}
            />
            My activity
          </label>

          <label className="aura-pill-toggle" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={includeTradeDecisions}
              onChange={(e) => onIncludeTradeDecisionsChange(e.target.checked)}
              disabled={!!loading}
            />
            Trade decisions
          </label>

          <label className="aura-pill-toggle" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={includeAccountSystem}
              onChange={(e) => onIncludeAccountSystemChange(e.target.checked)}
              disabled={!!loading}
            />
            Account &amp; system
          </label>
        </div>

        <div className="aura-control-right">
          <select
            className="aura-input"
            style={{ width: 190 }}
            value={timePreset}
            onChange={(e) => onTimePresetChange(e.target.value as any)}
            disabled={!!loading}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
            <option value="custom">Custom…</option>
          </select>

          <input
            className="aura-input aura-control-right--lg"
            placeholder="Search activity…"
            value={q}
            onChange={(e) => onQueryChange(e.target.value)}
            disabled={!!loading}
          />

          <button type="button" className="aura-btn aura-btn-subtle" onClick={onExport} disabled={!!loading}>
            Export CSV
          </button>
        </div>
      </div>

      {timePreset === "custom" ? (
        <div className="aura-row-between">
          <div className="aura-control-right">
            <div className="aura-muted aura-text-xs" style={{ marginRight: 8 }}>
              From
            </div>
            <input
              className="aura-input"
              style={{ width: 240 }}
              type="datetime-local"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              disabled={!!loading}
            />

            <div className="aura-muted aura-text-xs" style={{ marginLeft: 12, marginRight: 8 }}>
              To
            </div>
            <input
              className="aura-input"
              style={{ width: 240 }}
              type="datetime-local"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              disabled={!!loading}
            />
          </div>
        </div>
      ) : null}

      {includeAccountSystem ? (
        <div className="aura-pill-group">
          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "important"}
            onClick={() => onSystemPresetChange("important")}
            disabled={!!loading}
          >
            <span className="aura-pill-indicator" />
            Important
          </button>

          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "errors"}
            onClick={() => onSystemPresetChange("errors")}
            disabled={!!loading}
          >
            <span className="aura-pill-indicator" />
            Errors &amp; warnings
          </button>

          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "settings"}
            onClick={() => onSystemPresetChange("settings")}
            disabled={!!loading}
          >
            <span className="aura-pill-indicator" />
            Settings changes
          </button>

          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "all"}
            onClick={() => onSystemPresetChange("all")}
            disabled={!!loading}
          >
            <span className="aura-pill-indicator" />
            All (clean)
          </button>
        </div>
      ) : null}
    </div>
  );
}