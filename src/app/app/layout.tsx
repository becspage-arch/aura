// src/app/app/layout.tsx
import Link from "next/link";
import { AppTopBar } from "@/components/AppTopBar";
import { NotificationsListener } from "@/components/NotificationsListener";
import AppProviders from "./providers";

const nav = [
  { href: "/app", label: "Dashboard" },

  // CORE
  { href: "/app/live-trading", label: "Live Trading" },
  { href: "/app/charts", label: "Charts" },

  // CONFIG
  { href: "/app/strategy-setup", label: "Strategy Setup" },

  // DATA
  { href: "/app/reports", label: "Reports" },
  { href: "/app/activity", label: "Activity" },

  // ACCOUNT
  { href: "/app/account", label: "Account" },
  { href: "/app/profile", label: "Profile" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="aura-app-layout">
        {/* Sidebar */}
        <aside className="aura-sidebar">
          <div className="aura-sidebar__brand">Aura</div>

          <nav className="aura-sidebar__nav">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="aura-sidebar__link">
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
    </AppProviders>
  );
}
