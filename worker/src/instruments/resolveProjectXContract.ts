// worker/src/instruments/resolveProjectXContract.ts

/**
 * v1: ship ONLY MGC, but centralize resolution so rollover + more instruments
 * are implemented in exactly one place later.
 */
export function normalizeBaseSymbol(input: unknown): string {
  const s = String(input ?? "").trim().toUpperCase();
  return s;
}

export function resolveProjectXContractId(baseSymbol: string): string {
  const s = normalizeBaseSymbol(baseSymbol);

  // ✅ Ship with MGC only for now
  if (s === "MGC") return "CON.F.US.MGC.J26";

  // Later: switch this to broker lookup + front-month resolution.
  throw new Error(`Unsupported symbol: ${s}`);
}
