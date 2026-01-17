export const dynamic = "force-dynamic";

export default function LiveControlPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Live Control
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          This page will be where users pause, kill-switch, select account, and manage live running.
          (UI only for now - we’ll wire it later.)
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Coming soon
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Controls, account selector, symbol selector, safety confirmations.
        </p>
      </section>
    </div>
  );
}
