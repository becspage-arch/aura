export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Broker connections, notifications, integrations, preferences.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Coming soon
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Broker linking, webhook/keys (if needed), TradeZella integration, email alerts.
        </p>
      </section>
    </div>
  );
}
