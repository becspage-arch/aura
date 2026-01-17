import Link from "next/link";

const nav = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/live-control", label: "Live Control" },
  { href: "/app/strategy", label: "Strategy" },
  { href: "/app/trades", label: "Trades & Logs" },
  { href: "/app/settings", label: "Settings" },
  { href: "/app/audit", label: "Audit" },
  { href: "/app/profile", label: "Profile" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      {/* Sidebar */}
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
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "6px 8px",
                borderRadius: 10,
                color: "var(--foreground)",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  );
}
