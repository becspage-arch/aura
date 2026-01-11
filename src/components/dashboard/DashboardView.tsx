"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeUserChannel } from "@/lib/ably/client";
import { useDashboard } from "@/components/dashboard/DashboardStore";
import type { AuraRealtimeEvent } from "@/lib/realtime/events";
import Controls from "@/components/dashboard/Controls";

export default function DashboardView({ clerkUserId }: { clerkUserId: string }) {
  const { state, dispatch } = useDashboard();
  const channelName = useMemo(() => `user:${clerkUserId}`, [clerkUserId]);

  // Optional: filter by selected account
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    state.tradingState.selectedBrokerAccountId ?? null
  );

  useEffect(() => {
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
        // you can optionally mark affected orders as REJECTED if event includes orderId
      }
    });

    return () => unsubscribe();
  }, [channelName, dispatch]);

  const accounts = state.accounts;
  const orders = selectedAccountId
    ? state.orders.filter((o) => o.brokerAccountId === selectedAccountId)
    : state.orders;

  const fills = selectedAccountId
    ? state.fills.filter((f) => f.brokerAccountId === selectedAccountId)
    : state.fills;

  const events = state.events;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <h1>Dashboard</h1>

      {/* 1) Controls */}
      <Controls />

      {/* 2) Accounts */}
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Accounts</h2>
        {accounts.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No broker accounts yet.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => setSelectedAccountId(null)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd" }}
            >
              All
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAccountId(a.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: selectedAccountId === a.id ? "2px solid #999" : "1px solid #ddd",
                }}
              >
                {a.accountLabel ?? a.brokerName}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 3) Orders */}
      <OrdersTable orders={orders} />

      {/* 4) Fills */}
      <FillsTable fills={fills} />

      {/* 5) Timeline */}
      <Timeline events={events} />
    </div>
  );
}

function OrdersTable({ orders }: { orders: any[] }) {
  return (
    <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Orders</h2>
      {orders.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No orders yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Time</th>
              <th align="left">Symbol</th>
              <th align="left">Side</th>
              <th align="left">Type</th>
              <th align="left">Qty</th>
              <th align="left">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderTop: "1px solid #eee" }}>
                <td>{new Date(o.createdAt).toLocaleString()}</td>
                <td>{o.symbol}</td>
                <td>{o.side}</td>
                <td>{o.type}</td>
                <td>{o.qty}</td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FillsTable({ fills }: { fills: any[] }) {
  return (
    <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Fills</h2>
      {fills.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No fills yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Time</th>
              <th align="left">Symbol</th>
              <th align="left">Side</th>
              <th align="left">Qty</th>
              <th align="left">Price</th>
            </tr>
          </thead>
          <tbody>
            {fills.map((f) => (
              <tr key={f.id} style={{ borderTop: "1px solid #eee" }}>
                <td>{new Date(f.createdAt).toLocaleString()}</td>
                <td>{f.symbol}</td>
                <td>{f.side}</td>
                <td>{f.qty}</td>
                <td>{f.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Timeline({ events }: { events: any[] }) {
  return (
    <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Event timeline</h2>
      {events.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No events yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {events.map((e) => (
            <div key={e.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{e.type}</strong>
                <span style={{ opacity: 0.7 }}>{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ opacity: 0.8 }}>{e.message}</div>
              {e.data ? (
                <pre style={{ margin: 0, marginTop: 6, fontSize: 12, whiteSpace: "pre-wrap" }}>
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
