export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";

export default async function AuditPage() {
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
    take: 100,
  });

  const events = await db.eventLog.findMany({
    where: { userId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const Card = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 16,
        background: "var(--card)",
        color: "var(--card-foreground)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </section>
  );

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--muted-foreground)",
    padding: "10px 8px",
    borderBottom: "1px solid var(--border)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 8px",
    verticalAlign: "top",
    borderTop: "1px solid var(--border)",
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <p style={{ marginTop: 6, color: "var(--muted-foreground)" }}>
          User actions and system events for debugging and safety review.
        </p>
      </div>

      <Card title="User actions">
        {audit.length === 0 ? (
          <p style={{ color: "var(--muted-foreground)" }}>No audit entries yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Data</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td style={tdStyle}>{new Date(a.createdAt).toLocaleString()}</td>
                    <td style={tdStyle}>{a.action}</td>
                    <td style={tdStyle}>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 12,
                          whiteSpace: "pre-wrap",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        {a.data ? JSON.stringify(a.data, null, 2) : ""}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="System events">
        {events.length === 0 ? (
          <p style={{ color: "var(--muted-foreground)" }}>No system events yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Level</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Message</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td style={tdStyle}>{new Date(e.createdAt).toLocaleString()}</td>
                    <td style={tdStyle}>{e.level}</td>
                    <td style={tdStyle}>{e.type}</td>
                    <td style={tdStyle}>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
