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
    <div className="aura-toast-host">
      {items.map((t) => {
        const clickable = !!t.deepLink;

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (t.deepLink) router.push(t.deepLink);
            }}
            className={`aura-toast ${clickable ? "aura-toast--clickable" : ""}`}
            title={t.deepLink ? "Open" : undefined}
          >
            <div className="aura-toast__title">{t.title}</div>
            <div className="aura-toast__body">{t.body}</div>
          </button>
        );
      })}
    </div>
  );
}
