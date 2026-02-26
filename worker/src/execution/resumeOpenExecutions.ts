// worker/src/execution/resumeOpenExecutions.ts
import type { PrismaClient } from "@prisma/client";
import type { IBrokerAdapter } from "../broker/IBrokerAdapter.js";

const RESUMABLE_STATUSES = [
  "INTENT_CREATED",
  "ORDER_SUBMITTED",
  "ORDER_ACCEPTED",
  "ORDER_FILLED",
  "BRACKET_SUBMITTED",
  "BRACKET_ACTIVE",
  "POSITION_OPEN",
] as const;

function isFilled(o: any): boolean {
  if (!o) return false;
  const rawStatus = o?.status ?? o?.orderStatus ?? o?.state ?? null;
  const status = rawStatus == null ? "" : String(rawStatus).toUpperCase();
  if (status.includes("FILL")) return true;
  if (status === "2" || status === "FILLED" || status === "COMPLETE") return true;

  const filledQty = Number(
    o?.filledQty ??
      o?.filledQuantity ??
      o?.filledSize ??
      o?.quantityFilled ??
      o?.fillQty ??
      NaN
  );
  const totalQty = Number(o?.qty ?? o?.quantity ?? o?.size ?? o?.orderQty ?? NaN);

  if (Number.isFinite(filledQty) && filledQty > 0) {
    if (!Number.isFinite(totalQty)) return true;
    if (filledQty >= totalQty) return true;
  }

  const filledPrice = Number(o?.filledPrice ?? o?.avgFillPrice ?? NaN);
  if (Number.isFinite(filledPrice) && filledPrice > 0) return true;

  return false;
}

function isCancelled(o: any): boolean {
  if (!o) return false;
  const rawStatus = o?.status ?? o?.orderStatus ?? o?.state ?? null;
  const status = rawStatus == null ? "" : String(rawStatus).toUpperCase();
  return status.includes("CANCEL") || status === "CANCELLED" || status === "4";
}

export async function resumeOpenExecutions(params: {
  prisma: PrismaClient;
  broker: IBrokerAdapter;
  userId: string;
  brokerAccountId: string;
}) {
  const { prisma, broker, userId, brokerAccountId } = params;

  console.log("[resume] scanning for open executions", { brokerAccountId });

  const executions = await prisma.execution.findMany({
    where: {
      userId,
      brokerAccountId,
      status: { in: RESUMABLE_STATUSES as any },
    },
    orderBy: { updatedAt: "asc" },
  });

  if (!executions.length) {
    console.log("[resume] nothing to resume", { brokerAccountId });
    return;
  }

  console.log("[resume] found executions", { brokerAccountId, count: executions.length });

  for (const exec of executions) {
    try {
      console.log("[resume] checking", {
        brokerAccountId,
        id: exec.id,
        execKey: exec.execKey,
        status: exec.status,
        entryOrderId: exec.entryOrderId ?? null,
        stopOrderId: exec.stopOrderId ?? null,
        tpOrderId: exec.tpOrderId ?? null,
      });

      // 1) Broker position
      let positionSize = 0;
      let brokerPos: any = null;

      if (typeof (broker as any).getPosition === "function") {
        brokerPos = await (broker as any).getPosition({
          contractId: exec.contractId,
          symbol: exec.symbol ?? exec.contractId,
        });
        positionSize = Number(brokerPos?.size ?? 0);
      }

      // 2) Fetch broker orders by IDs (if available)
      const fetchOrderById = typeof (broker as any).fetchOrderById === "function"
        ? (broker as any).fetchOrderById.bind(broker)
        : null;

      const entry = exec.entryOrderId && fetchOrderById ? await fetchOrderById(exec.entryOrderId) : null;
      const sl = exec.stopOrderId && fetchOrderById ? await fetchOrderById(exec.stopOrderId) : null;
      const tp = exec.tpOrderId && fetchOrderById ? await fetchOrderById(exec.tpOrderId) : null;

      const slFilled = isFilled(sl);
      const tpFilled = isFilled(tp);

      // 3) If exit filled, we are closed (and should cancel the other if it still exists)
      if (slFilled || tpFilled) {
        const exitReason = slFilled ? "SL_FILLED" : "TP_FILLED";

        // best-effort cancel the other side if still live
        if (typeof (broker as any).cancelOrder === "function") {
          if (slFilled && exec.tpOrderId && !isFilled(tp) && !isCancelled(tp)) {
            try { await (broker as any).cancelOrder(exec.tpOrderId, "resume:OCO_SL_FILLED"); } catch {}
          }
          if (tpFilled && exec.stopOrderId && !isFilled(sl) && !isCancelled(sl)) {
            try { await (broker as any).cancelOrder(exec.stopOrderId, "resume:OCO_TP_FILLED"); } catch {}
          }
        }

        await prisma.execution.update({
          where: { id: exec.id },
          data: {
            status: "POSITION_CLOSED",
            error: null,
            meta: {
              ...(exec.meta as any),
              resume: {
                at: new Date().toISOString(),
                exitReason,
                sawPositionSize: positionSize,
              },
            } as any,
          },
        });

        console.log("[resume] marked closed (exit fill detected)", {
          brokerAccountId,
          execKey: exec.execKey,
          exitReason,
        });
        continue;
      }

      // 4) If broker flat AND no exits filled -> close it (ghost / manual close / broker auto-close)
      if (!positionSize) {
        await prisma.execution.update({
          where: { id: exec.id },
          data: {
            status: "POSITION_CLOSED",
            error: null,
            meta: {
              ...(exec.meta as any),
              resume: {
                at: new Date().toISOString(),
                exitReason: "BROKER_FLAT",
                entryFound: Boolean(entry),
                slFound: Boolean(sl),
                tpFound: Boolean(tp),
              },
            } as any,
          },
        });

        console.log("[resume] marked closed (broker flat)", {
          brokerAccountId,
          execKey: exec.execKey,
        });
        continue;
      }

      // 5) Broker has position -> ensure brackets exist (Phase 2)
      const absPos = Math.abs(Number(positionSize || 0));
      const customTag = (exec.customTag || "").trim();

      // Try to discover SL/TP by tag if IDs are missing or lookups failed
      let stopOrderId = exec.stopOrderId ?? null;
      let tpOrderId = exec.tpOrderId ?? null;

      const searchOrders =
        typeof (broker as any).searchOrders === "function" ? (broker as any).searchOrders.bind(broker) : null;

      if (customTag && searchOrders) {
        try {
          const orders = await searchOrders();
          const slByTag =
            orders.find(
              (o: any) =>
                typeof o?.customTag === "string" &&
                o.customTag.includes(customTag) &&
                o.customTag.includes(":SL")
            ) ?? null;

          const tpByTag =
            orders.find(
              (o: any) =>
                typeof o?.customTag === "string" &&
                o.customTag.includes(customTag) &&
                o.customTag.includes(":TP")
            ) ?? null;

          if (!stopOrderId && slByTag?.id != null) stopOrderId = String(slByTag.id);
          if (!tpOrderId && tpByTag?.id != null) tpOrderId = String(tpByTag.id);
        } catch (e) {
          console.warn("[resume] searchOrders failed (non-fatal)", {
            brokerAccountId,
            execKey: exec.execKey,
            err: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const missingSL = !stopOrderId;
      const missingTP = !tpOrderId;

      // If still missing, recreate exits using a safe refPrice (position averagePrice if available)
      const placeBracketsAfterEntry =
        typeof (broker as any).placeBracketsAfterEntry === "function"
          ? (broker as any).placeBracketsAfterEntry.bind(broker)
          : null;

        // Get avg price from earlier brokerPos if available
        let avgPrice: number | null = null;

        try {
          const first = Array.isArray(brokerPos?.positions)
            ? brokerPos.positions[0]
            : null;

          const ap = first?.averagePrice ?? null;
          const apNum = ap == null ? null : Number(ap);

          if (apNum != null && Number.isFinite(apNum) && apNum > 0) {
            avgPrice = apNum;
          }
        } catch {
          // ignore
        }

      let createdStop: string | null = null;
      let createdTp: string | null = null;

      const wantsSL = exec.stopLossTicks != null && Number.isFinite(Number(exec.stopLossTicks)) && Number(exec.stopLossTicks) > 0;
      const wantsTP =
        exec.takeProfitTicks != null && Number.isFinite(Number(exec.takeProfitTicks)) && Number(exec.takeProfitTicks) > 0;

      const hasSafeRef = Boolean(avgPrice) || Boolean(exec.entryOrderId);

      if ((missingSL || missingTP) && !hasSafeRef) {
        console.warn("[resume] missing exits but no safe ref - NOT recreating", {
          brokerAccountId,
          execKey: exec.execKey,
          missingSL,
          missingTP,
          entryOrderId: exec.entryOrderId ?? null,
          avgPrice,
        });
      }

      if ((missingSL || missingTP) && hasSafeRef && placeBracketsAfterEntry && (wantsSL || wantsTP)) {
        console.log("[resume] missing exits detected - recreating brackets", {
          brokerAccountId,
          execKey: exec.execKey,
          missingSL,
          missingTP,
          absPos,
          avgPrice,
        });

        const side =
          exec.side === "SELL" ? "sell" : "buy";

        // Place both exits; adapter will create whichever ticks exist
        const r = await placeBracketsAfterEntry({
          entryOrderId: exec.entryOrderId ?? null,
          contractId: exec.contractId,
          side,
          size: absPos > 0 ? absPos : Number(exec.qty ?? 1),
          stopLossTicks: wantsSL ? Number(exec.stopLossTicks) : null,
          takeProfitTicks: wantsTP ? Number(exec.takeProfitTicks) : null,
          stopPrice: null,
          takeProfitPrice: null,
          refPriceOverride: avgPrice,
          customTag: customTag || null,
        });

        if (r?.stopOrderId != null) createdStop = String(r.stopOrderId);
        if (r?.takeProfitOrderId != null) createdTp = String(r.takeProfitOrderId);

        if (!stopOrderId && createdStop) stopOrderId = createdStop;
        if (!tpOrderId && createdTp) tpOrderId = createdTp;
      }

      const nextStatus = stopOrderId && tpOrderId ? "BRACKET_ACTIVE" : "POSITION_OPEN";

      await prisma.execution.update({
        where: { id: exec.id },
        data: {
          status: nextStatus as any,
          stopOrderId: stopOrderId ?? null,
          tpOrderId: tpOrderId ?? null,
          meta: {
            ...(exec.meta as any),
            resume: {
              at: new Date().toISOString(),
              sawPositionSize: positionSize,
              entryFound: Boolean(entry),
              slFound: Boolean(sl) || Boolean(stopOrderId),
              tpFound: Boolean(tp) || Boolean(tpOrderId),
              recreated: Boolean(createdStop || createdTp),
              recreatedStopOrderId: createdStop,
              recreatedTpOrderId: createdTp,
              avgPrice,
            },
          } as any,
        },
      });

      console.log("[resume] marked open (and reconciled exits)", {
        brokerAccountId,
        execKey: exec.execKey,
        positionSize,
        stopOrderId,
        tpOrderId,
        status: nextStatus,
      });
    } catch (e: any) {
      console.error("[resume] failed for execution", {
        brokerAccountId,
        execKey: exec.execKey,
        err: e?.message ?? String(e),
      });
    }
  }
}
