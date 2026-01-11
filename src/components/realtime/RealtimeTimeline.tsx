"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeUserChannel } from "@/lib/ably/client";
import { AuraRealtimeEvent } from "@/lib/realtime/events";

type Props = {
  clerkUserId: string;
};

export default function RealtimeTimeline({ clerkUserId }: Props) {
  const channelName = useMemo(() => `user:${clerkUserId}`, [clerkUserId]);
  const [items, setItems] = useState<AuraRealtimeEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [publishStatus, setPublishStatus] = useState<string>("");

  useEffect(() => {
    setStatus("connecting");

    const unsubscribe = subscribeUserChannel(channelName, ({ event }) => {
      setItems((prev) => [event, ...prev].slice(0, 50));
    });

    setStatus("connected");

    return () => {
      unsubscribe();
      setStatus("disconnected");
    };
  }, [channelName]);

  async function publishTestEvent() {
    try {
      setPublishStatus("Publishing test event...");

      const res = await fetch("/api/ably/test-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const text = await res.text();
        setPublishStatus(`❌ Publish failed (${res.status}): ${text}`);
        return;
      }

      setPublishStatus("✅ Test event published! It should appear below.");
    } catch (err) {
      setPublishStatus(`❌ Publish failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <strong>Realtime</strong> — <span>{status}</span>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Channel: {channelName}</div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button
          type="button"
          onClick={publishTestEvent}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ddd",
            cursor: "pointer",
          }}
        >
          Publish test event
        </button>

        {publishStatus ? <div style={{ fontSize: 12, opacity: 0.9 }}>{publishStatus}</div> : null}
      </div>

      {items.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No events yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((e, idx) => (
            <div key={idx} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <strong>{e.type}</strong>
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  {new Date(e.ts).toLocaleString()}
                </span>
              </div>

              <pre style={{ margin: 0, marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(e.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
