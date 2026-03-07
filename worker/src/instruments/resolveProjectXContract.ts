// worker/src/instruments/resolveProjectXContract.ts

import { normalizeBaseSymbol } from "./normalizeBaseSymbol.js";

type ContractRow = {
  id: string;
  name?: string;
  description?: string;
  tickSize?: number;
  tickValue?: number;
  activeContract?: boolean;
  symbolId?: string; // eg "F.US.MGC"
};

type SearchResponse = {
  contracts?: ContractRow[];
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
};

function toNum(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the current active/front contract id for a base symbol (eg "MGC")
 * by calling ProjectX Contract/search (rollover-safe).
 */
export async function resolveProjectXContract(params: {
  token: string;
  symbol: string; // eg "MGC"
  live: boolean; // true for live, false for practice
}) {
  const symbol = normalizeBaseSymbol(params.symbol);
  if (!symbol) throw new Error("resolveProjectXContract: symbol missing");

  const res = await fetch("https://api.topstepx.com/api/Contract/search", {
    method: "POST",
    headers: {
      accept: "text/plain",
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      live: params.live,
      searchText: symbol,
    }),
  });

  const text = await res.text();
  let json: SearchResponse | null = null;
  try {
    json = text ? (JSON.parse(text) as SearchResponse) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(
      `ProjectX Contract/search failed (HTTP ${res.status})${
        json?.errorMessage ? `: ${json.errorMessage}` : ""
      }`
    );
  }

  const contracts = Array.isArray(json?.contracts) ? json!.contracts : [];
  if (!contracts.length) {
    throw new Error(
      `ProjectX Contract/search returned 0 results for symbol=${symbol} live=${params.live}`
    );
  }

  const preferNeedle = `.${symbol}`; // eg ".MGC"

  const best =
    contracts.find(
      (c) => c?.activeContract && String(c?.symbolId || "").toUpperCase().includes(preferNeedle)
    ) ??
    contracts.find((c) => c?.activeContract) ??
    contracts.find((c) => String(c?.symbolId || "").toUpperCase().includes(preferNeedle)) ??
    contracts[0];

  const contractId = String(best?.id || "").trim();
  if (!contractId) throw new Error("ProjectX Contract/search: selected contract missing id");

  return {
    contractId,
    tickSize: toNum(best?.tickSize),
    tickValue: toNum(best?.tickValue),
    activeContract: Boolean(best?.activeContract),
    symbolId: best?.symbolId ?? null,
    name: best?.name ?? null,
    description: best?.description ?? null,
    live: params.live,
    candidatesCount: contracts.length,
  };
}
