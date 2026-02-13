"use client";

import { useEffect, useState } from "react";

type ExecutionRow = {
  createdAt: string;
  execKey: string;
  brokerName: string;
  contractId: string;
  symbol: string | null;
  side: "BUY" | "SELL";
  qty: string;
  stopLossTicks: number | null;
  takeProfitTicks: number | null;
  status: string;
  entryOrderId: string | null;
  stopOrderId: string | null;
  tpOrderId: string | null;
  error: string | null;
};

type TradeRow = {
  closedAt: string;
  execKey: string;
  symbol: string;
  contractId: string | null;
  side: "BUY" | "SELL";
  qty: string;
  realizedPnlUsd: string;
  outcome: string;
  exitReason: string;
};

type ApiResp =
  | { ok: true; executions: ExecutionRow[]; trades: TradeRow[] }
  | { ok: false; error: string };

export function TradesAndExecutionsTables() {
  const [data, setData] = useState<{ executions: ExecutionRow[]; trades: TradeRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/charts/tables", { method: "GET" });
      const json = (await res.json()) as ApiResp;
      if (!res.ok || !json.ok) {
        setErr(!res.ok ? `HTTP ${res.status}` : json.error);
        setData(null);
        return;
      }
      setData({ executions: json.executions, trades: json.trades });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Charts - Debug Tables</h2>
        <button
          onClick={load}
          className="rounded-md border px-3 py-1 text-sm hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {err && <div className="text-sm text-red-400">Error: {err}</div>}

      {data && (
        <>
          <section className="space-y-2">
            <h3 className="text-base font-semibold">Recent Executions</h3>
            <div className="overflow-auto rounded-lg border border-white/10">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-white/5">
                  <tr className="text-left">
                    <th className="p-2">createdAt</th>
                    <th className="p-2">status</th>
                    <th className="p-2">side</th>
                    <th className="p-2">qty</th>
                    <th className="p-2">symbol/contract</th>
                    <th className="p-2">SL</th>
                    <th className="p-2">TP</th>
                    <th className="p-2">entryOrderId</th>
                    <th className="p-2">stopOrderId</th>
                    <th className="p-2">tpOrderId</th>
                    <th className="p-2">execKey</th>
                    <th className="p-2">error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.executions.map((r, i) => (
                    <tr key={`${r.execKey}:${i}`} className="border-t border-white/10">
                      <td className="p-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="p-2">{r.status}</td>
                      <td className="p-2">{r.side}</td>
                      <td className="p-2">{r.qty}</td>
                      <td className="p-2">
                        {r.symbol ?? ""}{" "}
                        <span className="opacity-70">{r.contractId}</span>
                      </td>
                      <td className="p-2">{r.stopLossTicks ?? ""}</td>
                      <td className="p-2">{r.takeProfitTicks ?? ""}</td>
                      <td className="p-2">{r.entryOrderId ?? ""}</td>
                      <td className="p-2">{r.stopOrderId ?? ""}</td>
                      <td className="p-2">{r.tpOrderId ?? ""}</td>
                      <td className="p-2 max-w-[420px] truncate" title={r.execKey}>{r.execKey}</td>
                      <td className="p-2 max-w-[320px] truncate" title={r.error ?? ""}>{r.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold">Recent Closed Trades</h3>
            <div className="overflow-auto rounded-lg border border-white/10">
              <table className="min-w-[1000px] w-full text-sm">
                <thead className="bg-white/5">
                  <tr className="text-left">
                    <th className="p-2">closedAt</th>
                    <th className="p-2">outcome</th>
                    <th className="p-2">pnlUsd</th>
                    <th className="p-2">side</th>
                    <th className="p-2">qty</th>
                    <th className="p-2">symbol/contract</th>
                    <th className="p-2">exitReason</th>
                    <th className="p-2">execKey</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trades.map((r, i) => (
                    <tr key={`${r.execKey}:${i}`} className="border-t border-white/10">
                      <td className="p-2 whitespace-nowrap">{new Date(r.closedAt).toLocaleString()}</td>
                      <td className="p-2">{r.outcome}</td>
                      <td className="p-2">{r.realizedPnlUsd}</td>
                      <td className="p-2">{r.side}</td>
                      <td className="p-2">{r.qty}</td>
                      <td className="p-2">
                        {r.symbol}{" "}
                        <span className="opacity-70">{r.contractId ?? ""}</span>
                      </td>
                      <td className="p-2">{r.exitReason}</td>
                      <td className="p-2 max-w-[520px] truncate" title={r.execKey}>{r.execKey}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
