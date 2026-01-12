export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";

export default async function AuditPage() {
  const user = await currentUser();
  if (!user) return null;

  // Ensure the user profile exists (create if missing)
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

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <h1>Audit</h1>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>User actions</h2>
        {audit.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No audit entries yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Time</th>
                <th align="left">Action</th>
                <th align="left">Data</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid #eee" }}>
                  <td>{new Date(a.createdAt).toLocaleString()}</td>
                  <td>{a.action}</td>
                  <td>
                    <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                      {a.data ? JSON.stringify(a.data, null, 2) : ""}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>System events</h2>
        {events.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No system events yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Time</th>
                <th align="left">Level</th>
                <th align="left">Type</th>
                <th align="left">Message</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid #eee" }}>
                  <td>{new Date(e.createdAt).toLocaleString()}</td>
                  <td>{e.level}</td>
                  <td>{e.type}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
