// src/components/toastBus.ts
export type AuraToastPayload = {
  title?: string;
  body: string;
  ts?: string;
  deepLink?: string;
};

export function emitToast(payload: AuraToastPayload) {
  if (typeof window === "undefined") return;

  const detail: AuraToastPayload = {
    title: payload.title ?? "Aura",
    body: payload.body,
    ts: payload.ts ?? new Date().toISOString(),
    deepLink: payload.deepLink ?? undefined,
  };

  window.dispatchEvent(new CustomEvent("aura:toast", { detail }));
}
