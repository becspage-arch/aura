import Link from "next/link";
import { AppTopBar } from "@/components/AppTopBar";
import { NotificationsListener } from "@/components/NotificationsListener";

const nav = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/live-control", label: "Live Trading" },
  { href: "/app/charts", label: "Charts" },
  { href: "/app/strategy", label: "Strategy Setup" },
  { href: "/app/trades", label: "Reports" },
  { href: "/app/settings", label: "Account" },
  { href: "/app/audit", label: "Activity" },
  { href: "/app/profile", label: "Profile" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="aura-app-layout">
      {/* Sidebar */}
      <aside className="aura-sidebar">
        <div className="aura-sidebar__brand">Aura</div>

        <nav className="aura-sidebar__nav">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="aura-sidebar__link"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div className="aura-main">
        <AppTopBar />
        <NotificationsListener />
        <main className="aura-main__content">{children}</main>
      </div>
    </div>
  );
}
