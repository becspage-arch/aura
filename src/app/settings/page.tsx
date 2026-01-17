import { ThemeToggle } from "@/components/theme-toggle";

export default function SettingsPage() {
  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
        Settings
      </h1>

      <div
        style={{
          background: "var(--card)",
          color: "var(--card-foreground)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 16,
        }}
      >
        <ThemeToggle />
        <p style={{ marginTop: 10, color: "var(--muted-foreground)" }}>
          Dark mode is the default. You can switch to light mode anytime.
        </p>
      </div>
    </div>
  );
}
