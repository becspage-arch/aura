// worker/src/instruments/normalizeBaseSymbol.ts

export function normalizeBaseSymbol(input: unknown): string {
  return String(input ?? "").trim().toUpperCase();
}