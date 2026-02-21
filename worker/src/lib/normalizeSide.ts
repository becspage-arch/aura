export function normalizeSide(v: unknown): "buy" | "sell" | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "buy" || s === "long") return "buy";
  if (s === "sell" || s === "short") return "sell";
  return null;
}
