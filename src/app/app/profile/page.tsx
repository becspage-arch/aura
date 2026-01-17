import { ThemeToggle } from "@/components/theme-toggle";

export default function ProfilePage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
        Profile & Settings
      </h1>

      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          background: "var(--card)",
          color: "var(--card-foreground)",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Appearance
        </h2>

        <ThemeToggle />

        <p style={{ marginTop: 10, color: "var(--muted-foreground)" }}>
          Dark mode is the default. You can switch to light mode anytime.
        </p>
      </section>
    </div>
  );
}
