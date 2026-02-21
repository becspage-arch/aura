// src/app/app/layout.tsx
import Link from "next/link";
import { AppTopBar } from "@/components/AppTopBar";
import { NotificationsListener } from "@/components/NotificationsListener";
import AppProviders from "./providers";
import SidebarProfile from "@/components/sidebar/SidebarProfile";

const navMain = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/live-trading", label: "Live Trading" },
  { href: "/app/charts", label: "Charts" },
];

const navTools = [
  { href: "/app/strategy-setup", label: "Strategy Setup" },
  { href: "/app/reports", label: "Reports" },
  { href: "/app/activity", label: "Activity" },
];

const navAccount = [
  { href: "/app/account", label: "Account" },
  { href: "/app/profile", label: "Profile" },
];

function NavSection(props: {
  title: string;
  items: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="aura-sidebar__section">
      <div className="aura-sidebar__sectionTitle">{props.title}</div>
      <nav className="aura-sidebar__nav">
        {props.items.map((item) => (
          <Link key={item.href} href={item.href} className="aura-sidebar__link">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="aura-app-layout">
        {/* Sidebar */}
        <aside className="aura-sidebar">
          <div className="aura-sidebar__brand">
            <div className="aura-sidebar__logo" aria-hidden="true" />
            <div className="aura-sidebar__brandText">
              <div className="aura-sidebar__brandName">TradeAura</div>
              <div className="aura-sidebar__brandTag">Trading Intelligence</div>
            </div>
          </div>

          <NavSection title="Main" items={navMain} />
          <NavSection title="Tools" items={navTools} />
          <NavSection title="Account" items={navAccount} />

          <div className="aura-sidebar__bottom">
            <SidebarProfile />
          </div>
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
