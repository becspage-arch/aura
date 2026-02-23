// worker/src/lib/tradingWindows.ts
import { DateTime } from "luxon";

export type TradingWindowsSelection = {
  asia: boolean;
  london: boolean;
  ny: boolean;
};

export type TradingWindowsMatch = {
  ok: boolean;
  ukIso: string;
  ukHm: string; // "HH:mm"
  matched: "asia" | "london" | "ny" | null;
  selected: Array<"asia" | "london" | "ny">;
  reason: "ALLOWED" | "ALL_HOURS" | "OUTSIDE_WINDOWS";
};

function inRange(params: { hm: string; start: string; end: string }) {
  // inclusive start, inclusive end
  return params.hm >= params.start && params.hm <= params.end;
}

/**
 * Trading windows are interpreted in Europe/London time.
 *
 * Asia:   00:00–07:59
 * London: 08:00–12:59
 * NY:     13:00–21:59
 *
 * IMPORTANT:
 * If none selected => "All Hours" => allow opening new trades at any time.
 */
export function matchTradingWindows(params: {
  atEpochSec: number;
  sessions: TradingWindowsSelection;
}): TradingWindowsMatch {
  const uk = DateTime.fromSeconds(params.atEpochSec, { zone: "Europe/London" });
  const ukHm = uk.toFormat("HH:mm");

  const selected: Array<"asia" | "london" | "ny"> = [];
  if (params.sessions.asia) selected.push("asia");
  if (params.sessions.london) selected.push("london");
  if (params.sessions.ny) selected.push("ny");

  //  If none selected => ALL HOURS (no restriction).
  if (selected.length === 0) {
    return {
      ok: true, // ✅ All hours (no restriction)
      ukIso: uk.toISO() ?? uk.toString(),
      ukHm,
      matched: null,
      selected,
      reason: "NONE_SELECTED",
    };
  }

  const isAsia = inRange({ hm: ukHm, start: "00:00", end: "07:59" });
  const isLondon = inRange({ hm: ukHm, start: "08:00", end: "12:59" });
  const isNy = inRange({ hm: ukHm, start: "13:00", end: "21:59" });

  const matched: TradingWindowsMatch["matched"] =
    isAsia ? "asia" : isLondon ? "london" : isNy ? "ny" : null;

  const allowed =
    (matched === "asia" && params.sessions.asia) ||
    (matched === "london" && params.sessions.london) ||
    (matched === "ny" && params.sessions.ny);

  return {
    ok: allowed,
    ukIso: uk.toISO() ?? uk.toString(),
    ukHm,
    matched,
    selected,
    reason: allowed ? "ALLOWED" : "OUTSIDE_WINDOWS",
  };
}
