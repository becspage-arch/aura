export const dynamic = "force-dynamic";

export default function TradesPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Trades & Logs
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          This will contain orders, fills, event timeline, errors - everything forensic.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Coming soon
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Orders table, fills table, event timeline, filters, export.
        </p>
      </section>
    </div>
  );
}
