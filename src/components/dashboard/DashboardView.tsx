"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeUserChannel } from "@/lib/ably/client";
import { useDashboard } from "@/components/dashboard/DashboardStore";
import type { AuraRealtimeEvent } from "@/lib/realtime/events";
import Controls from "@/components/dashboard/Controls";
import { TradingChart } from "@/components/charts/TradingChart";

const styles = {
  pageTitle: {
    color: "var(--foreground)",
  } as React.CSSProperties,
  muted: {
    color: "var(--muted-foreground)",
  } as React.CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 16,
    background: "var(--card)",
    color: "var(--card-foreground)",
    padding: 16,
  } as React.CSSProperties,
  chip: (active: boolean) =>
    ({
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "6px 12px",
      fontSize: 14,
      cursor: "pointer",
      background: active ? "var(--primary)" : "var(--card)",
      color: active ? "var(--primary-foreground)" : "var(--card-foreground)",
      transition: "filter 120ms ease",
    }) as React.CSSProperties,
  chipHoverable: {
    // subtle hover without hardcoding colours
    filter: "brightness(1.03)",
  } as React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  } as React.CSSProperties,
  th: {
    textAlign: "left",
    fontWeight: 600,
    fontSize: 12,
    color: "var(--muted-foreground)",
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
  } as React.CSSProperties,
  td: {
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
    color: "var(--card-foreground)",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  timelineItem: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--muted)",
    padding: 12,
  } as React.CSSProperties,
  code: {
    marginTop: 8,
    overflow: "auto",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--card)",
    padding: 10,
    fontSize: 12,
    color: "var(--card-foreground)",
  } as React.CSSProperties,
};

export default function DashboardView({ clerkUserId }: { clerkUserId?: string }) {
  const { state, dispatch } = useDashboard();

  const channelName = useMemo(
    () => (clerkUserId ? `user:${clerkUserId}` : null),
    [clerkUserId]
  );

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
          <h1 className="text-2xl font-semibold" style={styles.pageTitle}>
            Dashboard
          </h1>
          <p className="mt-1 text-sm" style={styles.muted}>
            Monitor, control, and review activity.
          </p>
        </div>
      </div>

      {/* Controls */}
      <section style={styles.card}>
        <h2 className="mb-3 text-sm font-semibold">Controls</h2>
        <Controls />
      </section>

      {/* Accounts */}
      <section style={styles.card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Accounts</h2>
          <span className="text-xs" style={styles.muted}>
            {selectedAccountId ? "Filtered" : "All"}
          </span>
        </div>

        {accounts.length === 0 ? (
          <p className="text-sm" style={styles.muted}>
            No broker accounts yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedAccountId(null)}
              style={styles.chip(selectedAccountId == null)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.filter =
                  styles.chipHoverable.filter as string;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.filter = "none";
              }}
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
                  style={styles.chip(active)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.filter =
                      styles.chipHoverable.filter as string;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.filter = "none";
                  }}
                >
                  {a.accountLabel ?? a.brokerName}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Chart */}
      <section style={styles.card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Chart</h2>
          <div className="text-xs" style={styles.muted}>
            {selectedSymbol}
          </div>
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
    <section style={styles.card}>
      <h2 className="mb-3 text-sm font-semibold">Orders</h2>

      {orders.length === 0 ? (
        <p className="text-sm" style={styles.muted}>
          No orders yet.
        </p>
      ) : (
        <div style={{ overflow: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Symbol</th>
                <th style={styles.th}>Side</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td style={styles.td}>{new Date(o.createdAt).toLocaleString()}</td>
                  <td style={styles.td}>{o.symbol}</td>
                  <td style={styles.td}>{o.side}</td>
                  <td style={styles.td}>{o.type}</td>
                  <td style={styles.td}>{o.qty}</td>
                  <td style={styles.td}>{o.status}</td>
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
    <section style={styles.card}>
      <h2 className="mb-3 text-sm font-semibold">Fills</h2>

      {fills.length === 0 ? (
        <p className="text-sm" style={styles.muted}>
          No fills yet.
        </p>
      ) : (
        <div style={{ overflow: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Symbol</th>
                <th style={styles.th}>Side</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Price</th>
              </tr>
            </thead>
            <tbody>
              {fills.map((f) => (
                <tr key={f.id}>
                  <td style={styles.td}>{new Date(f.createdAt).toLocaleString()}</td>
                  <td style={styles.td}>{f.symbol}</td>
                  <td style={styles.td}>{f.side}</td>
                  <td style={styles.td}>{f.qty}</td>
                  <td style={styles.td}>{f.price}</td>
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
    <section style={styles.card}>
      <h2 className="mb-3 text-sm font-semibold">Event timeline</h2>

      {events.length === 0 ? (
        <p className="text-sm" style={styles.muted}>
          No events yet.
        </p>
      ) : (
        <div className="grid gap-2">
          {events.map((e) => (
            <div key={e.id} style={styles.timelineItem}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold">{e.type}</div>
                <div className="text-xs" style={styles.muted}>
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </div>

              <div className="mt-1 text-sm" style={{ color: "var(--foreground)" }}>
                {e.message}
              </div>

              {e.data ? <pre style={styles.code}>{JSON.stringify(e.data, null, 2)}</pre> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
