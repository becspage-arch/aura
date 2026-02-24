// src/app/app/activity/_components/ActivityFeedCard.tsx
"use client";

import { ActivityFiltersRow } from "./ActivityFiltersRow";
import type { SystemPreset, TimePreset } from "./ActivityFiltersRow";
import { ActivityItemRow } from "./ActivityItemRow";

export function ActivityFeedCard(props: {
  // Filters
  includeMyActivity: boolean;
  onIncludeMyActivityChange: (v: boolean) => void;

  includeTradeDecisions: boolean;
  onIncludeTradeDecisionsChange: (v: boolean) => void;

  includeAccountSystem: boolean;
  onIncludeAccountSystemChange: (v: boolean) => void;

  systemPreset: SystemPreset;
  onSystemPresetChange: (v: SystemPreset) => void;

  timePreset: TimePreset;
  onTimePresetChange: (v: TimePreset) => void;

  customFrom: string;
  onCustomFromChange: (v: string) => void;

  customTo: string;
  onCustomToChange: (v: string) => void;

  q: string;
  onQueryChange: (v: string) => void;

  items: any[];
  loading: boolean;
  error: string | null;

  onLoadMore: () => void;
  canLoadMore: boolean;

  onExport: () => void;

  summary: null | {
    tradeOpportunities: number;
    tradesEntered: number;
    skipped: number;
    systemIssues: number;
  };
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
    items,
    loading,
    error,
    onLoadMore,
    canLoadMore,
    onExport,
    summary,
  } = props;

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Recent activity</div>
          <div className="aura-muted aura-text-xs">Clear, human-readable history of what happened and why.</div>
        </div>
        <div className="aura-muted aura-text-xs">{loading ? "Updating…" : " "}</div>
      </div>

      {/* Summary cards */}
      <div className="aura-mt-12" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <div className="aura-card" style={{ padding: 12 }}>
          <div className="aura-muted aura-text-xs">Trade opportunities</div>
          <div className="aura-card-title" style={{ marginTop: 6 }}>
            {summary?.tradeOpportunities ?? "—"}
          </div>
        </div>

        <div className="aura-card" style={{ padding: 12 }}>
          <div className="aura-muted aura-text-xs">Trades entered</div>
          <div className="aura-card-title" style={{ marginTop: 6 }}>
            {summary?.tradesEntered ?? "—"}
          </div>
        </div>

        <div className="aura-card" style={{ padding: 12 }}>
          <div className="aura-muted aura-text-xs">Skipped</div>
          <div className="aura-card-title" style={{ marginTop: 6 }}>
            {summary?.skipped ?? "—"}
          </div>
        </div>

        <div className="aura-card" style={{ padding: 12 }}>
          <div className="aura-muted aura-text-xs">System issues</div>
          <div className="aura-card-title" style={{ marginTop: 6 }}>
            {summary?.systemIssues ?? "—"}
          </div>
        </div>
      </div>

      <div className="aura-mt-12">
        <ActivityFiltersRow
          includeMyActivity={includeMyActivity}
          onIncludeMyActivityChange={onIncludeMyActivityChange}
          includeTradeDecisions={includeTradeDecisions}
          onIncludeTradeDecisionsChange={onIncludeTradeDecisionsChange}
          includeAccountSystem={includeAccountSystem}
          onIncludeAccountSystemChange={onIncludeAccountSystemChange}
          systemPreset={systemPreset}
          onSystemPresetChange={onSystemPresetChange}
          timePreset={timePreset}
          onTimePresetChange={onTimePresetChange}
          customFrom={customFrom}
          onCustomFromChange={onCustomFromChange}
          customTo={customTo}
          onCustomToChange={onCustomToChange}
          q={q}
          onQueryChange={onQueryChange}
          onExport={onExport}
          loading={loading}
        />
      </div>

      <div className="aura-divider" />

      {error ? <div className="aura-muted aura-text-xs">Error: {error}</div> : null}

      {!loading && !items?.length ? (
        <div className="aura-muted aura-text-xs">No activity yet for this time range.</div>
      ) : null}

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
