// src/app/app/activity/_components/ActivityFeedCard.tsx
"use client";

import { ActivityItemRow } from "./ActivityItemRow";
import { ACTIVITY_SCOPE_COPY, SYSTEM_PRESET_COPY } from "@/lib/auraCopy";
import type { SystemPreset, TimePreset } from "./ActivityFiltersRow";

type Summary = {
  tradeOpportunities: number;
  tradesEntered: number;
  skipped: number;
  systemIssues: number;
};

export function ActivityFeedCard(props: {
  // Checkboxes
  includeMyActivity: boolean;
  onIncludeMyActivityChange: (v: boolean) => void;

  includeTradeDecisions: boolean;
  onIncludeTradeDecisionsChange: (v: boolean) => void;

  includeAccountSystem: boolean;
  onIncludeAccountSystemChange: (v: boolean) => void;

  // System preset (only relevant when includeAccountSystem = true)
  systemPreset: SystemPreset;
  onSystemPresetChange: (v: SystemPreset) => void;

  // Time range
  timePreset: TimePreset;
  onTimePresetChange: (v: TimePreset) => void;

  customFrom: string;
  onCustomFromChange: (v: string) => void;

  customTo: string;
  onCustomToChange: (v: string) => void;

  // Search + actions
  q: string;
  onQueryChange: (v: string) => void;

  onExport: () => void;

  // Data
  items: any[];
  loading: boolean;
  error: string | null;

  onLoadMore: () => void;
  canLoadMore: boolean;

  summary?: Summary | null;
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

    items,
    loading,
    error,
    onLoadMore,
    canLoadMore,
    summary,
  } = props;

  // Derive copy keys from checkbox state
  const scopeKey = includeAccountSystem ? "all" : includeTradeDecisions ? "user+aura" : "user";
  const scopeCopy = ACTIVITY_SCOPE_COPY[scopeKey];
  const presetCopy = SYSTEM_PRESET_COPY[systemPreset];

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Activity</div>
          <div className="aura-muted aura-text-xs">
            {scopeCopy?.helper || ""}
            {includeAccountSystem ? (
              <>
                {" "}
                • <span>{presetCopy?.helper || ""}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="aura-row" style={{ gap: 10, alignItems: "center" }}>
          <div className="aura-muted aura-text-xs">{loading ? "Updating…" : " "}</div>

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

      {summary ? (
        <div
          className="aura-mt-12 aura-grid-gap-10"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          <div className="aura-card" style={{ padding: 12 }}>
            <div className="aura-muted aura-text-xs">Opportunities</div>
            <div className="aura-card-title">{summary.tradeOpportunities}</div>
          </div>
          <div className="aura-card" style={{ padding: 12 }}>
            <div className="aura-muted aura-text-xs">Entered</div>
            <div className="aura-card-title">{summary.tradesEntered}</div>
          </div>
          <div className="aura-card" style={{ padding: 12 }}>
            <div className="aura-muted aura-text-xs">Skipped</div>
            <div className="aura-card-title">{summary.skipped}</div>
          </div>
          <div className="aura-card" style={{ padding: 12 }}>
            <div className="aura-muted aura-text-xs">Issues</div>
            <div className="aura-card-title">{summary.systemIssues}</div>
          </div>
        </div>
      ) : null}

      <div className="aura-mt-12 aura-grid-gap-12">
        {/* Row 1: checkboxes + time preset + search + export */}
        <div className="aura-row-between" style={{ gap: 16, alignItems: "center" }}>
          <div className="aura-row" style={{ gap: 18, alignItems: "center", flexWrap: "wrap" }}>
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

          <div className="aura-control-right" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="aura-input"
              value={timePreset}
              disabled={!!loading}
              onChange={(e) => onTimePresetChange(e.target.value as TimePreset)}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="custom">Custom</option>
            </select>

            <input
              className="aura-input aura-control-right--lg"
              placeholder="Search activity…"
              value={q}
              onChange={(e) => onQueryChange(e.target.value)}
              disabled={!!loading}
            />

          </div>
        </div>

        {/* Row 2: custom date/time range */}
        {timePreset === "custom" ? (
          <div className="aura-row" style={{ gap: 12, flexWrap: "wrap" }}>
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

        {/* Row 3: system preset pills */}
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
      </div>

      <div className="aura-divider" />

      {error ? <div className="aura-muted aura-text-xs">Error: {error}</div> : null}

      {!loading && !items?.length ? <div className="aura-muted aura-text-xs">Nothing yet for this filter range.</div> : null}

      {items?.length ? (
        <div className="aura-grid-gap-10">
          {items.map((item) => (
            <ActivityItemRow key={`${item.kind}:${item.id}`} item={item} />
          ))}
        </div>
      ) : null}

      <div className="aura-mt-12">
        <button type="button" className="aura-btn aura-btn-subtle" onClick={onLoadMore} disabled={!canLoadMore || loading}>
          {canLoadMore ? "Load more" : "No more"}
        </button>
      </div>
    </section>
  );
}
