"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

type PauseGetResponse = {
  ok: true;
  isPaused: boolean;
  isKillSwitched?: boolean;
  killSwitchedAt?: string | null;
};

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function IconPlay(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function IconPause(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function IconShield(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l8 4v6c0 5-3.5 9.4-8 10-4.5-.6-8-5-8-10V6l8-4z" />
    </svg>
  );
}

function pageTitleFromPath(pathname: string) {
  // keep this tiny + explicit (matches your sidebar labels)
  if (pathname === "/app") return "Dashboard";
  if (pathname.startsWith("/app/live-control")) return "Live Control";
  if (pathname.startsWith("/app/strategy")) return "Strategy";
  if (pathname.startsWith("/app/trades")) return "Trades & Logs";
  if (pathname.startsWith("/app/settings")) return "Settings";
  if (pathname.startsWith("/app/audit")) return "Audit";
  if (pathname.startsWith("/app/profile")) return "Profile";
  return "Aura";
}

export function AppTopBar() {
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isKillSwitched, setIsKillSwitched] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchJSON<PauseGetResponse>("/api/trading-state/pause");
        if (cancelled) return;
        setIsPaused(!!res.isPaused);
        setIsKillSwitched(!!res.isKillSwitched);
      } catch {
        if (!cancelled) {
          setIsPaused(false);
          setIsKillSwitched(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const title = useMemo(() => pageTitleFromPath(pathname), [pathname]);

  const status = useMemo(() => {
    if (loading) {
      return { label: "—", tone: "muted" as const, Icon: null as any };
    }
    if (isKillSwitched) {
      return { label: "KILL SWITCH", tone: "danger" as const, Icon: IconShield };
    }
    if (isPaused) {
      return { label: "PAUSED", tone: "muted" as const, Icon: IconPause };
    }
    return { label: "RUNNING", tone: "gold" as const, Icon: IconPlay };
  }, [loading, isPaused, isKillSwitched]);

  const StatusIcon = status.Icon;

  return (
    <header className="aura-topbar" aria-label="Page header">
      <div className="aura-page-title">{title}</div>

      <div className="aura-topbar__right">
        <div className={`aura-topbar__state aura-topbar__state--${status.tone}`}>
          {StatusIcon ? <StatusIcon className="aura-topbar__stateIcon" /> : null}
          <span className="aura-topbar__stateText">{status.label}</span>
        </div>

        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              userButtonAvatarBox: "aura-clerk-avatar",
            },
          }}
        />
      </div>
    </header>
  );
}
