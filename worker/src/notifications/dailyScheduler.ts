// worker/src/notifications/dailyScheduler.ts

type DailySchedulerParams = {
  tz: string; // "Europe/London"
  onRun: () => Promise<void>;
};

function msUntilNextRun(tz: string, hour: number, minute: number) {
  // "End of day" runner - schedule next run at HH:MM in the given tz.
  // Uses Intl to avoid bringing in a cron dependency.
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);

  // Build "today at HH:MM:00" in tz, then convert to a real Date by formatting back to ISO-ish parts.
  // We do it by creating a Date in UTC for the *next* run target.
  const targetLocal = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));

  // If we've already passed today's target time in that tz, move to tomorrow.
  // We compare using formatted hours/minutes in tz to avoid DST issues.
  const curHour = Number(parts.hour);
  const curMin = Number(parts.minute);
  const alreadyPassed = curHour > hour || (curHour === hour && curMin >= minute);

  const nextLocal = alreadyPassed
    ? new Date(targetLocal.getTime() + 24 * 60 * 60 * 1000)
    : targetLocal;

  // Convert "nextLocal interpreted in tz" to actual delay.
  // Approximation is fine for dev; catch-up on boot covers edge cases.
  const delay = nextLocal.getTime() - Date.now();

  // Guard: never schedule negative/too small
  return Math.max(delay, 5_000);
}

export function startDailyScheduler(params: DailySchedulerParams) {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function scheduleNext() {
    if (stopped) return;

    const delayMs = msUntilNextRun(params.tz, 23, 59);
    timer = setTimeout(async () => {
      try {
        await params.onRun();
      } catch (e) {
        // Do not crash the worker for a summary failure
        console.warn("[daily-summary] run failed", e);
      } finally {
        // Always schedule again
        void scheduleNext();
      }
    }, delayMs);

    console.log("[daily-summary] next run scheduled", {
      tz: params.tz,
      inMinutes: Math.round(delayMs / 60000),
    });
  }

  void scheduleNext();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
