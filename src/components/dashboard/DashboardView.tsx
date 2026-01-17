"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeUserChannel } from "@/lib/ably/client";
import { useDashboard } from "@/components/dashboard/DashboardStore";
import type { AuraRealtimeEvent } from "@/lib/realtime/events";
import Controls from "@/components/dashboard/Controls";
import { TradingChart } from "@/components/charts/TradingChart";

export default function DashboardView({ clerkUserId }: { clerkUserId?: string }) {
  const { state, dispatch } = useDashboard();

  const channelName = useMemo(() => (clerkUserId ? `user:${clerkUserId}` : null), [clerkUserId]);

  // Optional: filter by selected account
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    state.tradingState?.selectedBrokerAccountId ?? null
  );

  useEffect(() => {
    if (!channelName) return;

    const unsubscribe = subscribeUserChannel(channelName, ({ event }) => {
      const e = event as AuraRealtimeEvent;

      // Always append an event row (timeline)
      dispatch({
        type: "ADD_EVENT",
        payload: {
          id: `${e.ts}:${e.type}`, // ok for now; later you can publish real event ids
          createdAt: e.ts,
          type: e.type,
          level: e.type === "error" ? "error" : "info",
          message: e.type,
          data: e.data as any,
          brokerAccountId: (e.data as any)?.accountId ?? null,
          orderId: (e.data as any)?.orderId ?? null,
        },
      });

      // Update tables based on event type
      if (e.type === "order_submitted") {
        const d: any = e.data;
        dispatch({
          type: "UPSERT_ORDER",
          payload: {
            id: d.orderId ?? `${e.ts}:${d.symbol}`,
            brokerAccountId: d.accountId,
            externalId: d.externalId ?? null,
            symbol: d.symbol,
            side: d.side === "buy" ? "BUY" : "SELL",
            type: (d.orderType ?? "MARKET").toUpperCase(),
            status: "PLACED",
            qty: String(d.qty),
            price: d.price != null ? String(d.price) : null,
            stopPrice: d.stopPrice != null ? String(d.stopPrice) : null,
            filledQty: "0",
            avgFillPrice: null,
            createdAt: e.ts,
            updatedAt: e.ts,
          } as any,
        });
      }

      if (e.type === "order_filled") {
        const d: any = e.data;

        // Fill row
        dispatch({
          type: "UPSERT_FILL",
          payload: {
            id: d.fillId ?? d.orderId ?? `${e.ts}:${d.symbol}`,
            brokerAccountId: d.accountId,
            orderId: d.orderId ?? null,
            externalId: d.externalId ?? null,
            symbol: d.symbol,
            side: d.side === "buy" ? "BUY" : "SELL",
            qty: String(d.qty),
            price: String(d.fillPrice),
            createdAt: e.ts,
          },
        });

        // Update order status too if possible
        if (d.orderId) {
          dispatch({
            type: "UPSERT_ORDER",
            payload: {
              id: d.orderId,
              brokerAccountId: d.accountId,
              externalId: d.externalId ?? null,
              symbol: d.symbol,
              side: d.side === "buy" ? "BUY" : "SELL",
              type: "MARKET",
              status: "FILLED",
              qty: String(d.qty),
              price: null,
              stopPrice: null,
              filledQty: String(d.qty),
              avgFillPrice: String(d.fillPrice),
              createdAt: e.ts,
              updatedAt: e.ts,
            } as any,
          });
        }
      }

      if (e.type === "order_cancelled") {
        const d: any = e.data;
        if (d.orderId) {
          dispatch({
            type: "UPSERT_ORDER",
            payload: {
              id: d.orderId,
              brokerAccountId: d.accountId,
              externalId: null,
              symbol: d.symbol ?? "—",
              side: "BUY",
              type: "MARKET",
              status: "CANCELLED",
              qty: "0",
              price: null,
              stopPrice: null,
              filledQty: "0",
              avgFillPrice: null,
              createdAt: e.ts,
              updatedAt: e.ts,
            } as any,
          });
        }
      }

      if (e.type === "error") {
        // optionally mark affected orders as REJECTED if event includes orderId
      }
    });

    return () => unsubscribe();
  }, [channelName, dispatch]);

  const accounts = state.accounts ?? [];
  const orders = selectedAccountId
    ? state.orders.filter((o: any) => o.brokerAccountId === selectedAccountId)
    : state.orders;

  const fills = selectedAccountId
    ? state.fills.filter((f: any) => f.brokerAccountId === selectedAccountId)
    : state.fills;

  const events = state.events;

  // Prefer the app-selected symbol if you have it, otherwise default to MGC
  const selectedSymbol = state.tradingState?.selectedSymbol ?? "MGC";

  return (
    <div className="grid gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Monitor, control, and review activity.
          </p>
        </div>
      </div>

      {/* Controls */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Controls</h2>
        <Controls />
      </section>

      {/* Accounts */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Accounts</h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {selectedAccountId ? "Filtered" : "All"}
          </span>
        </div>

        {accounts.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No broker accounts yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedAccountId(null)}
              className={`rounded-xl border px-3 py-1.5 text-sm ${
                selectedAccountId == null
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900/40"
              }`}
            >
              All
            </button>

            {accounts.map((a: any) => {
              const active = selectedAccountId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAccountId(a.id)}
                  className={`rounded-xl border px-3 py-1.5 text-sm ${
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900/40"
                  }`}
                >
                  {a.accountLabel ?? a.brokerName}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Chart */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Chart</h2>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{selectedSymbol}</div>
        </div>

        <TradingChart symbol={selectedSymbol} initialTf="15s" channelName={channelName} />
      </section>

      <OrdersTable orders={orders} />
      <FillsTable fills={fills} />
      <Timeline events={events} />
    </div>
  );
}

function OrdersTable({ orders }: { orders: any[] }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Orders</h2>

      {orders.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No orders yet.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="text-xs text-zinc-500 dark:text-zinc-400">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 text-left font-medium">Time</th>
                <th className="py-2 text-left font-medium">Symbol</th>
                <th className="py-2 text-left font-medium">Side</th>
                <th className="py-2 text-left font-medium">Type</th>
                <th className="py-2 text-left font-medium">Qty</th>
                <th className="py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-zinc-900 dark:text-zinc-50">
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-zinc-100 dark:border-zinc-900/60">
                  <td className="py-2">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="py-2">{o.symbol}</td>
                  <td className="py-2">{o.side}</td>
                  <td className="py-2">{o.type}</td>
                  <td className="py-2">{o.qty}</td>
                  <td className="py-2">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FillsTable({ fills }: { fills: any[] }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Fills</h2>

      {fills.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No fills yet.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="text-xs text-zinc-500 dark:text-zinc-400">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 text-left font-medium">Time</th>
                <th className="py-2 text-left font-medium">Symbol</th>
                <th className="py-2 text-left font-medium">Side</th>
                <th className="py-2 text-left font-medium">Qty</th>
                <th className="py-2 text-left font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="text-zinc-900 dark:text-zinc-50">
              {fills.map((f) => (
                <tr key={f.id} className="border-t border-zinc-100 dark:border-zinc-900/60">
                  <td className="py-2">{new Date(f.createdAt).toLocaleString()}</td>
                  <td className="py-2">{f.symbol}</td>
                  <td className="py-2">{f.side}</td>
                  <td className="py-2">{f.qty}</td>
                  <td className="py-2">{f.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Timeline({ events }: { events: any[] }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Event timeline</h2>

      {events.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No events yet.</p>
      ) : (
        <div className="grid gap-2">
          {events.map((e) => (
            <div
              key={e.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{e.type}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </div>

              <div className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{e.message}</div>

              {e.data ? (
                <pre className="mt-2 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                  {JSON.stringify(e.data, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
