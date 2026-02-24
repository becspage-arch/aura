// src/app/app/activity/page.tsx
"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityScope } from "./_components/ActivityFiltersRow";
import { ActivityFeedCard } from "./_components/ActivityFeedCard";

type ApiRes = {
  ok: true;
  items: any[];
  nextCursor: string | null;
};

function buildUrl(params: { scope: ActivityScope; q: string; limit: number; cursor?: string | null }) {
  const sp = new URLSearchParams();
  sp.set("scope", params.scope);
  sp.set("limit", String(params.limit));
  if (params.q.trim()) sp.set("q", params.q.trim());
  if (params.cursor) sp.set("cursor", params.cursor);
  return `/api/activity?${sp.toString()}`;
}

function buildExportUrl(params: { scope: ActivityScope; q: string }) {
  const sp = new URLSearchParams();
  sp.set("scope", params.scope);
  if (params.q.trim()) sp.set("q", params.q.trim());
  return `/api/activity/export?${sp.toString()}`;
}

export default function ActivityPage() {
  const LIMIT = 35;

  const [scope, setScope] = useState<ActivityScope>("user"); // default: user only ✅
  const [q, setQ] = useState("");

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const url = buildUrl({ scope, q, limit: LIMIT });
      const res = await fetch(url, { method: "GET" });
      const json = (await res.json().catch(() => null)) as ApiRes | any;

      if (!res.ok || json?.ok !== true) {
        throw new Error(json?.error || "Failed to load activity");
      }

      setItems(json.items || []);
      setNextCursor(json.nextCursor ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [scope, q]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;

    setLoading(true);
    setErr(null);

    try {
      const url = buildUrl({ scope, q, limit: LIMIT, cursor: nextCursor });
      const res = await fetch(url, { method: "GET" });
      const json = (await res.json().catch(() => null)) as ApiRes | any;

      if (!res.ok || json?.ok !== true) {
        throw new Error(json?.error || "Failed to load more");
      }

      setItems((prev) => [...prev, ...(json.items || [])]);
      setNextCursor(json.nextCursor ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [scope, q, nextCursor]);

  // Reload on scope/q changes (with a tiny debounce for typing)
  useEffect(() => {
    const t = setTimeout(() => {
      loadFirst();
    }, 200);
    return () => clearTimeout(t);
  }, [loadFirst]);

  const onExport = useCallback(() => {
    const url = buildExportUrl({ scope, q });
    window.open(url, "_blank");
  }, [scope, q]);

  const canLoadMore = !!nextCursor;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10">
      <div className="aura-page">
        <ActivityFeedCard
          scope={scope}
          onScopeChange={(v) => {
            setScope(v);
          }}
          q={q}
          onQueryChange={setQ}
          items={items}
          loading={loading}
          error={err}
          onLoadMore={loadMore}
          canLoadMore={canLoadMore}
          onExport={onExport}
        />
      </div>
    </div>
  );
}
