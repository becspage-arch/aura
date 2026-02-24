// src/app/app/activity/_components/ActivityFeedCard.tsx
"use client";

import { ActivityFiltersRow, type ActivityScope } from "./ActivityFiltersRow";
import { ActivityItemRow } from "./ActivityItemRow";

type ActivityResponse = {
  ok: true;
  items: any[];
  nextCursor: string | null;
};

export function ActivityFeedCard(props: {
  scope: ActivityScope;
  onScopeChange: (v: ActivityScope) => void;
  q: string;
  onQueryChange: (v: string) => void;

  items: any[];
  loading: boolean;
  error: string | null;

  onLoadMore: () => void;
  canLoadMore: boolean;

  onExport: () => void;
}) {
  const {
    scope,
    onScopeChange,
    q,
    onQueryChange,
    items,
    loading,
    error,
    onLoadMore,
    canLoadMore,
    onExport,
  } = props;

  const hint =
    scope === "user"
      ? "Tip: switch on Aura evaluations to see why entries were taken or skipped."
      : scope === "user+aura"
        ? "Showing your actions + Aura’s entry decisions."
        : "Including system events (heartbeats and candle noise hidden).";

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Recent activity</div>
          <div className="aura-muted aura-text-xs">{hint}</div>
        </div>
        <div className="aura-muted aura-text-xs">{loading ? "Updating…" : " "}</div>
      </div>

      <div className="aura-mt-12">
        <ActivityFiltersRow
          scope={scope}
          onScopeChange={onScopeChange}
          q={q}
          onQueryChange={onQueryChange}
          onExport={onExport}
          loading={loading}
        />
      </div>

      <div className="aura-divider" />

      {error ? (
        <div className="aura-muted aura-text-xs">Error: {error}</div>
      ) : null}

      {!loading && !items?.length ? (
        <div className="aura-muted aura-text-xs">
          No activity yet. Once Aura is running, you’ll see evaluations and actions here.
        </div>
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
