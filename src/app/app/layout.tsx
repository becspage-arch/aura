import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: "100vh" }}>
      <aside style={{ borderRight: "1px solid #e5e5e5", padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>Aura</div>
        <nav style={{ display: "grid", gap: 8 }}>
          <Link href="/app">Dashboard</Link>
          <Link href="/app/audit">Audit</Link>
        </nav>
      </aside>
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  );
}
