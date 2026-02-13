export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";

const HIDDEN_EVENT_TYPES = [
  "market.quote",
  "candle_closed",
  "candle_built",
  "candle_update",
];

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

  const audit = await db.auditLog.findMany({
    where: { userId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const events = await db.eventLog.findMany({
    where: {
      userId: profile.id,
      NOT: {
        type: { in: HIDDEN_EVENT_TYPES },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const merged = [
    ...audit.map((a) => ({
      id: `audit-${a.id}`,
      createdAt: a.createdAt,
      title: a.action,
      subtitle: "User action",
      level: "USER",
      details: a.data ?? null,
    })),
    ...events.map((e) => ({
      id: `event-${e.id}`,
      createdAt: e.createdAt,
      title: e.type,
      subtitle: e.message ?? "System event",
      level: e.level ?? "INFO",
      details: e.data ?? null,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 35);

  return (
    <div className="mx-auto max-w-6xl aura-page">
      <div>
        <p className="aura-page-subtitle">
          Strategy decisions, executions and your actions.
        </p>
      </div>

      <section className="aura-card">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Latest 35</div>
            <div className="aura-muted aura-text-xs aura-mt-6">
              Showing newest first.
            </div>
          </div>

          <button className="aura-btn aura-btn-subtle">
            Export CSV (soon)
          </button>
        </div>

        <div className="aura-divider" />

        {merged.length === 0 ? (
          <div className="aura-muted aura-text-sm">
            No activity yet.
          </div>
        ) : (
          <div className="aura-grid-gap-12 aura-mt-12">
            {merged.map((item) => (
              <div key={item.id} className="aura-card-muted">
                <div className="aura-row-between">
                  <div>
                    <div className="aura-font-semibold">
                      {item.title}
                    </div>
                    <div className="aura-muted aura-text-xs aura-mt-6">
                      {new Date(item.createdAt).toLocaleString()} • {item.subtitle}
                    </div>
                  </div>

                  <div className="aura-pill">
                    {item.level}
                  </div>
                </div>

                {item.details && (
                  <pre className="aura-mt-10 aura-text-xs aura-muted">
                    {JSON.stringify(item.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="aura-divider" />

        <div className="aura-muted aura-text-xs">
          View full history (coming soon)
        </div>
      </section>
    </div>
  );
}
