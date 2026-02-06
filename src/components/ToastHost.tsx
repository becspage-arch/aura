// src/components/ToastHost.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ToastItem = {
  id: string;
  title: string;
  body: string;
  deepLink?: string;
  ts: string; // ISO
};

export function ToastHost({ toasts }: { toasts: ToastItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<ToastItem[]>(toasts);

  useEffect(() => {
    setItems(toasts);
  }, [toasts]);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 9999,
        maxWidth: 360,
      }}
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            if (t.deepLink) router.push(t.deepLink);
          }}
          style={{
            textAlign: "left",
            borderRadius: 14,
            padding: "12px 14px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(10,10,10,0.92)",
            color: "white",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            cursor: t.deepLink ? "pointer" : "default",
          }}
          title={t.deepLink ? "Open trade" : undefined}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.title}</div>
          <div style={{ opacity: 0.9, fontSize: 13, lineHeight: 1.35 }}>{t.body}</div>
        </button>
      ))}
    </div>
  );
}
