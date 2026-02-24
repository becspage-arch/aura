// src/app/app/activity/_components/ActivityFiltersRow.tsx
"use client";

import { SYSTEM_PRESET_COPY, type SystemPresetCopyKey } from "@/lib/auraCopy";

export type SystemPreset = "important" | "errors" | "settings" | "all";

// Used by page.tsx to build from/to timestamps
export type TimePreset = "today" | "yesterday" | "last7" | "last30" | "custom";

export function ActivityFiltersRow(props: {
  // checkboxes
  includeMyActivity: boolean;
  onIncludeMyActivityChange: (v: boolean) => void;

  includeTradeDecisions: boolean;
  onIncludeTradeDecisionsChange: (v: boolean) => void;

  includeAccountSystem: boolean;
  onIncludeAccountSystemChange: (v: boolean) => void;

  // system preset
  systemPreset: SystemPreset;
  onSystemPresetChange: (v: SystemPreset) => void;

  // time
  timePreset: TimePreset;
  onTimePresetChange: (v: TimePreset) => void;

  customFrom: string;
  onCustomFromChange: (v: string) => void;

  customTo: string;
  onCustomToChange: (v: string) => void;

  // search
  q: string;
  onQueryChange: (v: string) => void;

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

    loading,
  } = props;

  const presetKey: SystemPresetCopyKey = systemPreset as SystemPresetCopyKey;

  return (
    <div className="aura-grid-gap-12">
      {/* Row 1: left = checkboxes, right = time preset + search */}
      <div className="aura-row-between" style={{ gap: 16, alignItems: "center" }}>
        <div className="aura-row" style={{ gap: 18, flexWrap: "wrap" }}>
          <label className="aura-row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includeMyActivity}
              disabled={!!loading}
              onChange={(e) => onIncludeMyActivityChange(e.target.checked)}
            />
            <span>My activity</span>
          </label>

          <label className="aura-row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includeTradeDecisions}
              disabled={!!loading}
              onChange={(e) => onIncludeTradeDecisionsChange(e.target.checked)}
            />
            <span>Trade decisions</span>
          </label>

          <label className="aura-row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includeAccountSystem}
              disabled={!!loading}
              onChange={(e) => onIncludeAccountSystemChange(e.target.checked)}
            />
            <span>Account &amp; system</span>
          </label>
        </div>

        <div className="aura-control-right" style={{ gap: 12 }}>
          <select
            className="aura-input"
            value={timePreset}
            disabled={!!loading}
            onChange={(e) => onTimePresetChange(e.target.value as TimePreset)}
            style={{ width: 170 }}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>

          <input
            className="aura-input aura-control-right--lg"
            placeholder="Search activity…"
            value={q}
            onChange={(e) => onQueryChange(e.target.value)}
            disabled={!!loading}
            style={{ width: 320 }}
          />
        </div>
      </div>

      {/* Row 2: custom range inputs */}
      {timePreset === "custom" ? (
        <div className="aura-row" style={{ gap: 14, flexWrap: "wrap" }}>
          <div className="aura-grid-gap-6">
            <div className="aura-muted aura-text-xs">From</div>
            <input
              type="datetime-local"
              className="aura-input"
              value={customFrom}
              disabled={!!loading}
              onChange={(e) => onCustomFromChange(e.target.value)}
            />
          </div>

          <div className="aura-grid-gap-6">
            <div className="aura-muted aura-text-xs">To</div>
            <input
              type="datetime-local"
              className="aura-input"
              value={customTo}
              disabled={!!loading}
              onChange={(e) => onCustomToChange(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {/* Row 3: system preset pills (only when account & system enabled) */}
      {includeAccountSystem ? (
        <div className="aura-pill-group">
          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "important"}
            onClick={() => onSystemPresetChange("important")}
          >
            <span className="aura-pill-indicator" />
            {SYSTEM_PRESET_COPY.important.label}
          </button>

          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "errors"}
            onClick={() => onSystemPresetChange("errors")}
          >
            <span className="aura-pill-indicator" />
            {SYSTEM_PRESET_COPY.errors.label}
          </button>

          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "settings"}
            onClick={() => onSystemPresetChange("settings")}
          >
            <span className="aura-pill-indicator" />
            {SYSTEM_PRESET_COPY.settings.label}
          </button>

          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={systemPreset === "all"}
            onClick={() => onSystemPresetChange("all")}
          >
            <span className="aura-pill-indicator" />
            {SYSTEM_PRESET_COPY.all.label}
          </button>
        </div>
      ) : null}

      {/* Helper line */}
      <div className="aura-muted aura-text-xs">
        Shows every trade Aura considered - entered or skipped, with the reason.
        {includeAccountSystem ? (
          <>
            {" "}
            • <span>{SYSTEM_PRESET_COPY[presetKey]?.helper || ""}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
