// src/app/share/[id]/page.tsx
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ShareSnapshotPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const row = await db.systemState.findUnique({
    where: { key: `snapshot:${id}` },
    select: { value: true, updatedAt: true },
  });

  if (!row) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Snapshot not found</h1>
        <p>This snapshot link is invalid or has been removed.</p>
      </main>
    );
  }

  const v: any = row.value;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Aura Snapshot</h1>
      <p style={{ opacity: 0.8 }}>
        Created: {v?.createdAt ?? row.updatedAt.toISOString()}
      </p>

      <pre
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          overflow: "auto",
          maxWidth: 1100,
        }}
      >
        {JSON.stringify(v?.payload ?? v, null, 2)}
      </pre>
    </main>
  );
}
