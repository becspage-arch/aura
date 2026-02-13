// src/components/AppTopBar.tsx
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
  const p =
    pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;

  if (p === "/app") return "Dashboard";
  if (p.startsWith("/app/live-trading")) return "Live Trading";
  if (p.startsWith("/app/charts")) return "Charts";
  if (p.startsWith("/app/strategy-setup")) return "Strategy Setup";
  if (p.startsWith("/app/reports")) return "Reports";
  if (p.startsWith("/app/account")) return "Account";
  if (p.startsWith("/app/activity")) return "Activity";
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchJSON<PauseGetResponse>("/api/trading-state/pause");
        if (cancelled) return;
        setIsPaused(!!res.isPaused);
        setIsKillSwitched(!!res.isKillSwitched);
      } catch {
        // don't break UI if endpoint unavailable
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const clerkUserId = user?.id;
    if (!clerkUserId) return;

    const statusChannelName = `user:${clerkUserId}`;

    const unsubscribeStatus = subscribeUserChannel(statusChannelName, (item) => {
      if (item.name !== "status_update") return;

      const data = (item.event as any)?.data ?? {};
      if (typeof data.isPaused === "boolean") setIsPaused(data.isPaused);
      if (typeof data.isKillSwitched === "boolean") setIsKillSwitched(data.isKillSwitched);
    });

    return () => {
      unsubscribeStatus();
    };
  }, [isLoaded, user?.id]);

  const statusLabel = isKillSwitched ? "EMERGENCY STOP" : isPaused ? "PAUSED" : "RUNNING";
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
              "Run/Pause controls are on the Live Trading page.\n\nGo there now?"
            );
            if (ok) router.push("/app/live-trading");
          }}
          title="Open Live Trading"
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
