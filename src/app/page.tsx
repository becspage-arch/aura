import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-10 px-8 py-24 text-center">
        {/* Logo / Brand */}
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Aura
        </h1>

        {/* Coming soon */}
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Aura is coming soon.
          <br />
          We’re building something powerful behind the scenes.
        </p>

        {/* Navigation buttons */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/sign-in"
            className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            Sign in
          </Link>

          <Link
            href="/sign-up"
            className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Sign up
          </Link>
        </div>

        {/* Dev / testing links */}
        <div className="flex flex-col gap-2 pt-8 text-sm text-zinc-500 dark:text-zinc-500">
          <Link href="/app" className="hover:underline">
            Go to dashboard
          </Link>
          <Link href="/sign-out" className="hover:underline">
            Sign out
          </Link>
        </div>
      </main>
    </div>
  );
}
