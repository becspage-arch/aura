export const dynamic = "force-dynamic";

export default function TradesAndLogsPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Trades & Logs</h1>
        <p style={{ marginTop: 6, color: "var(--muted-foreground)" }}>
          This page will be where users review trades, fills, orders, events, and export logs.
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
          Trade list, filters, replay links, and diagnostic logs.
        </div>
      </section>
    </div>
  );
}
