import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid min-h-screen"
      style={{ gridTemplateColumns: "240px 1fr" }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--card-foreground)",
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 16 }}>Aura</div>

        <nav style={{ display: "grid", gap: 8 }}>
          <Link href="/app">Dashboard</Link>
          <Link href="/app/audit">Audit</Link>
          <Link href="/app/profile">Profile</Link>
        </nav>
      </aside>

      <main
        style={{
          background: "var(--background)",
          color: "var(--foreground)",
          padding: 24,
        }}
      >
        {children}
      </main>
    </div>
  );
}
