// src/app/app/activity/_components/ActivityFeedCard.tsx
"use client";

import { ActivityFiltersRow, type ActivityScope, type SystemPreset } from "./ActivityFiltersRow";
import { ActivityItemRow } from "./ActivityItemRow";
import { ACTIVITY_SCOPE_COPY, SYSTEM_PRESET_COPY } from "@/lib/auraCopy";

export function ActivityFeedCard(props: {
  scope: ActivityScope;
  onScopeChange: (v: ActivityScope) => void;

  systemPreset: SystemPreset;
  onSystemPresetChange: (v: SystemPreset) => void;

  q: string;
  onQueryChange: (v: string) => void;

  items: any[];
  loading: boolean;
  error: string | null;

  onLoadMore: () => void;
  canLoadMore: boolean;

  onExport: () => void;

  summary?: { tradeOpportunities: number; tradesEntered: number; skipped: number; systemIssues: number } | null;
}) {
  const {
    scope,
    onScopeChange,
    systemPreset,
    onSystemPresetChange,
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

  const scopeCopy = ACTIVITY_SCOPE_COPY[scope];
  const presetCopy = SYSTEM_PRESET_COPY[systemPreset];

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Activity</div>
          <div className="aura-muted aura-text-xs">
            {scopeCopy?.helper || ""}
            {scope === "all" ? (
              <>
                {" "}
                • <span>{presetCopy?.helper || ""}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="aura-muted aura-text-xs">{loading ? "Updating…" : " "}</div>
      </div>

      {summary ? (
        <div className="aura-mt-12 aura-grid-gap-10" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
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

      <div className="aura-mt-12">
        <ActivityFiltersRow
          scope={scope}
          onScopeChange={onScopeChange}
          systemPreset={systemPreset}
          onSystemPresetChange={onSystemPresetChange}
          q={q}
          onQueryChange={onQueryChange}
          onExport={onExport}
          loading={loading}
        />
      </div>

      <div className="aura-divider" />

      {error ? <div className="aura-muted aura-text-xs">Error: {error}</div> : null}

      {!loading && !items?.length ? (
        <div className="aura-muted aura-text-xs">Nothing yet for this filter range.</div>
      ) : null}

      {items?.length ? (
        <div className="aura-grid-gap-10">
          {items.map((item) => (
            <ActivityItemRow key={`${item.kind}:${item.id}`} item={item} />
          ))}
        </div>
      ) : null}

      <div className="aura-mt-12">
        <button
          type="button"
          className="aura-btn aura-btn-subtle"
          onClick={onLoadMore}
          disabled={!canLoadMore || loading}
        >
          {canLoadMore ? "Load more" : "No more"}
        </button>
      </div>
    </section>
  );
}
