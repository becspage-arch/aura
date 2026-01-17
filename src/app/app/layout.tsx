import Link from "next/link";
import { ThemeProvider } from "next-themes";

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
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <div className="grid min-h-screen grid-cols-[240px_1fr] bg-zinc-50 dark:bg-black">
        {/* Sidebar */}
        <aside className="border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Aura
          </div>

          <nav className="grid gap-2 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="p-6">{children}</main>
      </div>
    </ThemeProvider>
  );
}
