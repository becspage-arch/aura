export const dynamic = "force-dynamic";

export default function LiveControlPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Live Control</h1>
        <p style={{ marginTop: 6, color: "var(--muted-foreground)" }}>
          This page will be where users pause, kill-switch, select account, and manage live running.
          (UI only for now - we’ll wire it later.)
        </p>
      </div>

      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
          background: "var(--card)",
          color: "var(--card-foreground)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Coming soon</div>
        <div style={{ color: "var(--muted-foreground)" }}>
          Controls, account selector, symbol selector, safety confirmations.
        </div>
      </section>
    </div>
  );
}
