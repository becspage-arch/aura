"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { subscribeUserChannel } from "@/lib/ably/client";

type PauseGetResponse = {
  ok: true;
  isPaused: boolean;
  isKillSwitched?: boolean;
  killSwitchedAt?: string | null;
};

function titleFromPath(pathname: string) {
  // Normalize: remove trailing slash
  const p = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;

  // Order matters (more specific first)
  if (p === "/app") return "Dashboard";
  if (p.startsWith("/app/live-control")) return "Live Control";
  if (p.startsWith("/app/strategy")) return "Strategy";
  if (p.startsWith("/app/trades")) return "Trades & Logs";
  if (p.startsWith("/app/settings")) return "Settings";
  if (p.startsWith("/app/audit")) return "Audit";
  if (p.startsWith("/app/profile")) return "Profile";

  return "Aura";
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
  }

  return (await res.json()) as T;
}

export function AppTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const title = useMemo(() => titleFromPath(pathname), [pathname]);

  const { user, isLoaded } = useUser();

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isKillSwitched, setIsKillSwitched] = useState<boolean>(false);

  // Initial fetch (so it renders correctly on first load / refresh)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchJSON<PauseGetResponse>("/api/trading-state/pause");
        if (cancelled) return;
        setIsPaused(!!res.isPaused);
        setIsKillSwitched(!!res.isKillSwitched);
      } catch {
        // If endpoint isn’t available for some reason, don’t break the UI.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime updates (instant when Run/Pause/Kill changes)
  useEffect(() => {
    if (!isLoaded) return;
    const clerkUserId = user?.id;
    if (!clerkUserId) return;

    const statusChannelName = `user:${clerkUserId}`;
    const uiChannelName = `aura:ui:${clerkUserId}`;

    const unsubscribeStatus = subscribeUserChannel(statusChannelName, (item) => {
      // You publish: publishToUser(clerkUserId, "status_update", {...})
      // So item.name should be "status_update"
      if (item.name !== "status_update") return;

      const data = (item.event as any)?.data ?? {};
      if (typeof data.isPaused === "boolean") setIsPaused(data.isPaused);
      if (typeof data.isKillSwitched === "boolean") setIsKillSwitched(data.isKillSwitched);
    });

    // Keep this subscription even if AppTopBar doesn't use the events directly yet.
    // It proves the per-user UI stream wiring is correct and prevents "no subscribers" surprises.
    const unsubscribeUi = subscribeUserChannel(uiChannelName, () => {});

    return () => {
      unsubscribeStatus();
      unsubscribeUi();
    };

  }, [isLoaded, user?.id]);

  const statusLabel = isKillSwitched ? "KILL SWITCH" : isPaused ? "PAUSED" : "RUNNING";
  const statusIcon = isKillSwitched ? "⛔" : isPaused ? "❚❚" : "▶";

  const statusClass = isKillSwitched
    ? "aura-topbar__state aura-topbar__state--danger"
    : isPaused
    ? "aura-topbar__state aura-topbar__state--muted"
    : "aura-topbar__state aura-topbar__state--gold";

  return (
    <header className="aura-topbar">
      <div className="aura-topbar__left">
        <div className="aura-page-title">{title}</div>
      </div>

      <div className="aura-topbar__right">
        <button
          type="button"
          className={statusClass}
          onClick={() => {
            const ok = window.confirm(
              "Run/Pause controls live on the Live Control page.\n\nGo there now?"
            );
            if (ok) router.push("/app/live-control");
          }}
          title="Open Live Control"
        >
          <span className="aura-topbar__stateIcon" aria-hidden="true">
            {statusIcon}
          </span>
          <span>{statusLabel}</span>
        </button>

        <div className="aura-topbar__user">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
