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

type StatusGetResponse = {
  ok: true;
  brokerAccountId: string | null;
  isPaused: boolean;
  isKillSwitched: boolean;
  brokerConnected: boolean;
  lastHeartbeatAt: string | null;
};

function titleFromPath(pathname: string) {
  const p = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;

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

  const [isPaused, setIsPaused] = useState(false);
  const [isKillSwitched, setIsKillSwitched] = useState(false);
  const [brokerConnected, setBrokerConnected] = useState(false);

  const [shareBusy, setShareBusy] = useState(false);

  // initial pause/kill (existing endpoint)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchJSON<PauseGetResponse>("/api/trading-state/pause");
        if (cancelled) return;
        setIsPaused(!!res.isPaused);
        setIsKillSwitched(!!res.isKillSwitched);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // status poll (brokerConnected + also keeps pause/kill consistent)
  useEffect(() => {
    let cancelled = false;
    let t: any = null;

    async function tick() {
      try {
        const res = await fetchJSON<StatusGetResponse>("/api/trading-state/status");
        if (cancelled) return;
        setIsPaused(!!res.isPaused);
        setIsKillSwitched(!!res.isKillSwitched);
        setBrokerConnected(!!res.brokerConnected);
      } catch {
        // ignore
      } finally {
        if (!cancelled) t = setTimeout(tick, 30_000);
      }
    }

    tick();

    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, []);

  // realtime updates for pause/kill
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

  const systemRunning = !isPaused && !isKillSwitched && brokerConnected;

  const systemLabel = systemRunning ? "System Running" : "System Not Running";
  const systemClass = systemRunning
    ? "aura-topbar__state aura-topbar__state--gold"
    : "aura-topbar__state aura-topbar__state--muted";

  async function onShareSnapshot() {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      // minimal payload for now (fast + stable)
      const payload = {
        sharedFromPath: pathname,
        at: new Date().toISOString(),
        status: { isPaused, isKillSwitched, brokerConnected, systemRunning },
      };

      const res = await fetchJSON<{ ok: true; id: string }>("/api/share/snapshot", {
        method: "POST",
        body: JSON.stringify({ payload }),
      });

      const url = `${window.location.origin}/share/${res.id}`;

      try {
        await navigator.clipboard.writeText(url);
        window.alert("✅ Snapshot link copied to clipboard");
      } catch {
        window.prompt("Copy this snapshot link:", url);
      }
    } catch (e) {
      window.alert(`❌ Failed to create snapshot${e instanceof Error ? `: ${e.message}` : ""}`);
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <header className="aura-topbar">
      <div className="aura-topbar__left">
        <div className="aura-page-title">{title}</div>
      </div>

      <div className="aura-topbar__right">
        <button
          type="button"
          className="aura-topbar__action"
          onClick={onShareSnapshot}
          disabled={shareBusy}
          title="Create a shareable snapshot link"
        >
          {shareBusy ? "Sharing…" : "Share Snapshot"}
        </button>

        <button
          type="button"
          className={systemClass}
          onClick={() => router.push("/app/live-trading")}
          title="Open Live Trading"
        >
          <span className="aura-topbar__stateIcon" aria-hidden="true">
            {systemRunning ? "●" : "○"}
          </span>
          <span>{systemLabel}</span>
        </button>

        <div className="aura-topbar__user">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
