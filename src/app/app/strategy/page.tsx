export const dynamic = "force-dynamic";

export default function StrategyPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Strategy
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Read-only strategy summary first - later an advanced edit mode.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Coming soon
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Entry rules summary, risk model, time windows, filters, versioning.
        </p>
      </section>
    </div>
  );
}
