export const dynamic = "force-dynamic";

import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";

type ActivityItem =
  | {
      kind: "user_action";
      id: string;
      createdAt: Date;
      title: string;
      summary: string;
      details: any | null;
    }
  | {
      kind: "system_event";
      id: string;
      createdAt: Date;
      title: string;
      summary: string;
      details: any | null;
      level: string;
      type: string;
    };

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function safeJsonString(v: any) {
  try {
    if (v == null) return "";
    return JSON.stringify(v, null, 2);
  } catch {
    return "";
  }
}

export default async function ActivityPage() {
  const user = await currentUser();
  if (!user) return null;

  const profile = await ensureUserProfile({
    clerkUserId: user.id,
    email: user.emailAddresses?.[0]?.emailAddress ?? null,
    displayName:
      user.firstName || user.lastName
        ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
        : user.username ?? null,
  });

  // UX defaults: keep the page fast + readable
  const TAKE = 35;

  // Fetch a bit more than we show after merge (so sorting still yields enough)
  const rawAudit = await db.auditLog.findMany({
    where: { userId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const rawEvents = await db.eventLog.findMany({
    where: { userId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const auditItems: ActivityItem[] = rawAudit.map((a) => ({
    kind: "user_action",
    id: a.id,
    createdAt: a.createdAt,
    title: a.action,
    summary: a.data ? truncate(safeJsonString(a.data).replace(/\s+/g, " ").trim(), 140) : "",
    details: a.data ?? null,
  }));

  const eventItems: ActivityItem[] = rawEvents.map((e) => ({
    kind: "system_event",
    id: e.id,
    createdAt: e.createdAt,
    level: e.level,
    type: e.type,
    title: `${e.level.toUpperCase()} • ${e.type}`,
    summary: truncate(String(e.message ?? "").trim(), 180),
    details: e.data ?? null,
  }));

  const merged = [...auditItems, ...eventItems]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, TAKE);

  const hasAny = merged.length > 0;

  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Header */}
      <div className="aura-group-header">
        <div>
          <div className="aura-page-title">Activity</div>
          <p className="aura-page-subtitle">
            A lightweight feed of your most recent actions and Aura system events.
          </p>
        </div>

        <div className="aura-control-right">
          {/* Export placeholder */}
          <button type="button" className="aura-btn aura-btn-subtle" title="Coming soon" disabled>
            Export CSV (soon)
          </button>

          {/* Full history placeholder */}
          <Link href="/app/activity" className="aura-btn aura-btn-subtle" title="Coming soon">
            View full history (soon)
          </Link>
        </div>
      </div>

      {/* Quick filters (UI-only for now) */}
      <section className="aura-card-muted">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Filters</div>
            <div className="aura-muted aura-text-xs aura-mt-10">
              (Filters are UI-only for now. We’ll wire them once we add pagination + full history.)
            </div>
          </div>

          <div className="aura-pill-group">
            <button type="button" className="aura-pill-toggle" aria-pressed="true">
              <span className="aura-pill-indicator" />
              All
            </button>
            <button type="button" className="aura-pill-toggle" aria-pressed="false" disabled>
              <span className="aura-pill-indicator" />
              User actions (soon)
            </button>
            <button type="button" className="aura-pill-toggle" aria-pressed="false" disabled>
              <span className="aura-pill-indicator" />
              System events (soon)
            </button>
          </div>
        </div>
      </section>

      {/* Main feed */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Latest {TAKE}</div>
            <div className="aura-muted aura-text-xs aura-mt-10">
              Tip: click a row to expand details.
            </div>
          </div>

          <div className="aura-muted aura-text-xs">
            Showing newest first • {new Date().toLocaleString()}
          </div>
        </div>

        <div className="aura-divider" />

        {!hasAny ? (
          <div className="aura-muted aura-text-xs">No activity yet.</div>
        ) : (
          <div className="aura-grid-gap-10">
            {merged.map((item) => {
              const pill =
                item.kind === "user_action" ? (
                  <span className="aura-pill">User action</span>
                ) : (
                  <span className="aura-pill">System</span>
                );

              const right =
                item.kind === "system_event" ? (
                  <span className="aura-muted aura-text-xs">
                    {item.level.toUpperCase()}
                  </span>
                ) : (
                  <span className="aura-muted aura-text-xs">—</span>
                );

              return (
                <details key={`${item.kind}:${item.id}`} className="aura-table aura-card-muted">
                  <summary className="aura-control-row aura-row-link" style={{ padding: 12 }}>
                    <div className="aura-control-meta">
                      <div className="aura-control-title">{item.title}</div>
                      <div className="aura-control-help">
                        {new Date(item.createdAt).toLocaleString()} •{" "}
                        <span className="aura-muted">{item.summary || "No summary"}</span>
                      </div>
                    </div>

                    <div className="aura-control-right">
                      {pill}
                      {right}
                    </div>
                  </summary>

                  <div style={{ padding: 12 }}>
                    {item.kind === "system_event" ? (
                      <div className="aura-grid-gap-10">
                        <div className="aura-muted aura-text-xs">
                          <span className="aura-mono">type</span>: {item.type}
                        </div>
                        <pre className="aura-card-muted aura-text-xs" style={{ margin: 0 }}>
{safeJsonString({
  message: item.summary,
  data: item.details ?? null,
})}
                        </pre>
                      </div>
                    ) : (
                      <pre className="aura-card-muted aura-text-xs" style={{ margin: 0 }}>
{safeJsonString(item.details)}
                      </pre>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* Secondary note (keep it customer-friendly) */}
      <section className="aura-card-muted">
        <div className="aura-card-title">What is this page for?</div>
        <p className="aura-muted aura-text-xs aura-mt-10">
          Activity is a quick “what just happened?” view. Reports is where you’ll drill into trades,
          fills, and performance.
        </p>
        <div className="aura-mt-12">
          <Link href="/app/reports" className="aura-btn aura-btn-subtle">
            Go to Reports
          </Link>
        </div>
      </section>
    </div>
  );
}
