// src/app/app/activity/page.tsx
"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityFeedCard } from "./_components/ActivityFeedCard";
import type { SystemPreset, TimePreset } from "./_components/ActivityFiltersRow";

type ApiRes = {
  ok: true;
  items: any[];
  nextCursor: string | null;
  summary?: {
    tradeOpportunities: number;
    tradesEntered: number;
    skipped: number;
    systemIssues: number;
  };
};

function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfTodayLocal() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function toDateTimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function presetToRange(preset: TimePreset, customFrom: string, customTo: string) {
  const now = new Date();

  if (preset === "today") {
    return { from: startOfTodayLocal(), to: now };
  }

  if (preset === "yesterday") {
    const from = startOfTodayLocal();
    from.setDate(from.getDate() - 1);
    const to = endOfTodayLocal();
    to.setDate(to.getDate() - 1);
    return { from, to };
  }

  if (preset === "last7") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from, to: now };
  }

  if (preset === "last30") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from, to: now };
  }

  // custom
  const from = customFrom ? new Date(customFrom) : null;
  const to = customTo ? new Date(customTo) : null;
  return { from, to };
}

function buildUrl(params: {
  q: string;
  limit: number;
  cursor?: string | null;

  my: boolean;
  decisions: boolean;
  system: boolean;
  systemPreset: SystemPreset;

  from?: Date | null;
  to?: Date | null;
}) {
  const sp = new URLSearchParams();
  sp.set("limit", String(params.limit));
  if (params.q.trim()) sp.set("q", params.q.trim());
  if (params.cursor) sp.set("cursor", params.cursor);

  sp.set("my", params.my ? "1" : "0");
  sp.set("decisions", params.decisions ? "1" : "0");
  sp.set("system", params.system ? "1" : "0");

  if (params.system) {
    sp.set("systemPreset", params.systemPreset);
  }

  if (params.from) sp.set("from", params.from.toISOString());
  if (params.to) sp.set("to", params.to.toISOString());

  return `/api/activity?${sp.toString()}`;
}

function buildExportUrl(params: {
  q: string;

  my: boolean;
  decisions: boolean;
  system: boolean;
  systemPreset: SystemPreset;

  from?: Date | null;
  to?: Date | null;
}) {
  const sp = new URLSearchParams();
  if (params.q.trim()) sp.set("q", params.q.trim());

  sp.set("my", params.my ? "1" : "0");
  sp.set("decisions", params.decisions ? "1" : "0");
  sp.set("system", params.system ? "1" : "0");

  if (params.system) {
    sp.set("systemPreset", params.systemPreset);
  }

  if (params.from) sp.set("from", params.from.toISOString());
  if (params.to) sp.set("to", params.to.toISOString());

  return `/api/activity/export?${sp.toString()}`;
}

export default function ActivityPage() {
  const LIMIT = 35;

  // Checkboxes
  const [includeMyActivity, setIncludeMyActivity] = useState(true);
  const [includeTradeDecisions, setIncludeTradeDecisions] = useState(true);
  const [includeAccountSystem, setIncludeAccountSystem] = useState(false);

  // System preset
  const [systemPreset, setSystemPreset] = useState<SystemPreset>("important");

  // Time range
  const [timePreset, setTimePreset] = useState<TimePreset>("today");
  const [customFrom, setCustomFrom] = useState(toDateTimeLocalValue(startOfTodayLocal()));
  const [customTo, setCustomTo] = useState(toDateTimeLocalValue(endOfTodayLocal()));

  const [q, setQ] = useState("");

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<ApiRes["summary"] | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const range = useMemo(() => presetToRange(timePreset, customFrom, customTo), [timePreset, customFrom, customTo]);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const url = buildUrl({
        q,
        limit: LIMIT,
        my: includeMyActivity,
        decisions: includeTradeDecisions,
        system: includeAccountSystem,
        systemPreset,
        from: range.from ?? undefined,
        to: range.to ?? undefined,
      });

      const res = await fetch(url, { method: "GET" });
      const json = (await res.json().catch(() => null)) as ApiRes | any;

      if (!res.ok || json?.ok !== true) {
        throw new Error(json?.error || "Failed to load activity");
      }

      setItems(json.items || []);
      setNextCursor(json.nextCursor ?? null);
      setSummary(json.summary ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setItems([]);
      setNextCursor(null);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [
    q,
    includeMyActivity,
    includeTradeDecisions,
    includeAccountSystem,
    systemPreset,
    range.from,
    range.to,
  ]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;

    setLoading(true);
    setErr(null);

    try {
      const url = buildUrl({
        q,
        limit: LIMIT,
        cursor: nextCursor,
        my: includeMyActivity,
        decisions: includeTradeDecisions,
        system: includeAccountSystem,
        systemPreset,
        from: range.from ?? undefined,
        to: range.to ?? undefined,
      });

      const res = await fetch(url, { method: "GET" });
      const json = (await res.json().catch(() => null)) as ApiRes | any;

      if (!res.ok || json?.ok !== true) {
        throw new Error(json?.error || "Failed to load more");
      }

      setItems((prev) => [...prev, ...(json.items || [])]);
      setNextCursor(json.nextCursor ?? null);
      setSummary(json.summary ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    q,
    nextCursor,
    includeMyActivity,
    includeTradeDecisions,
    includeAccountSystem,
    systemPreset,
    range.from,
    range.to,
  ]);

  // Reload on filter changes (tiny debounce for typing)
  useEffect(() => {
    const t = setTimeout(() => {
      loadFirst();
    }, 200);
    return () => clearTimeout(t);
  }, [loadFirst]);

  const onExport = useCallback(() => {
    const url = buildExportUrl({
      q,
      my: includeMyActivity,
      decisions: includeTradeDecisions,
      system: includeAccountSystem,
      systemPreset,
      from: range.from ?? undefined,
      to: range.to ?? undefined,
    });
    window.open(url, "_blank");
  }, [q, includeMyActivity, includeTradeDecisions, includeAccountSystem, systemPreset, range.from, range.to]);

  const canLoadMore = !!nextCursor;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10">
      <div className="aura-page">
        <ActivityFeedCard
          includeMyActivity={includeMyActivity}
          onIncludeMyActivityChange={setIncludeMyActivity}
          includeTradeDecisions={includeTradeDecisions}
          onIncludeTradeDecisionsChange={setIncludeTradeDecisions}
          includeAccountSystem={includeAccountSystem}
          onIncludeAccountSystemChange={setIncludeAccountSystem}
          systemPreset={systemPreset}
          onSystemPresetChange={setSystemPreset}
          timePreset={timePreset}
          onTimePresetChange={setTimePreset}
          customFrom={customFrom}
          onCustomFromChange={setCustomFrom}
          customTo={customTo}
          onCustomToChange={setCustomTo}
          q={q}
          onQueryChange={setQ}
          items={items}
          loading={loading}
          error={err}
          onLoadMore={loadMore}
          canLoadMore={canLoadMore}
          onExport={onExport}
          summary={summary ?? null}
        />
      </div>
    </div>
  );
}
