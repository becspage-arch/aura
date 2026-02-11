export function isNativeCapacitor(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const w = window as any;
    // Capacitor injects this global
    return !!w.Capacitor?.isNativePlatform;
  } catch {
    return false;
  }
}
