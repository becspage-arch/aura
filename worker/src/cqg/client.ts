import WebSocket from "ws";
import type protobuf from "protobufjs";
import { CQG, env } from "../env.js";
import { loadCqgRoot } from "./proto.js";

type CqgTypes = {
  ClientMsg: protobuf.Type;
  ServerMsg: protobuf.Type;
};

function lookupType(root: protobuf.Root, name: string): protobuf.Type {
  const candidates = [name, `cqg.${name}`, `cqg.webapi.${name}`, `WebAPI.${name}`];
  for (const c of candidates) {
    const t = root.lookup(c);
    if (t && (t as any).fields) return t as protobuf.Type;
  }
  throw new Error(`Could not find protobuf type: ${name}`);
}

async function loadTypes(): Promise<CqgTypes> {
  const root = await loadCqgRoot();
  return {
    ClientMsg: lookupType(root, "ClientMsg"),
    ServerMsg: lookupType(root, "ServerMsg"),
  };
}

function encodeMessage(t: protobuf.Type, obj: any): Buffer {
  const err = t.verify(obj);
  if (err) throw new Error(`protobuf verify failed: ${err}`);
  const msg = t.create(obj);
  const bytes = t.encode(msg).finish();
  return Buffer.from(bytes);
}

function decodeMessage(t: protobuf.Type, data: WebSocket.RawData): any {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
  const decoded = t.decode(buf);
  // defaults:true is useful, but it also creates lots of empty arrays – that’s OK
  return t.toObject(decoded, { longs: String, enums: String, defaults: true });
}

export async function startCqgDemoFeed() {
  if (!CQG.username || !CQG.password) {
    console.log(`[${env.WORKER_NAME}] CQG disabled (missing username/password)`);
    return;
  }

  console.log(`[${env.WORKER_NAME}] CQG connecting`, {
    url: CQG.wsUrl,
    symbols: CQG.symbols,
    protocol: `${CQG.protocolMajor}.${CQG.protocolMinor}`,
    user: CQG.username,
  });

  const { ClientMsg, ServerMsg } = await loadTypes();

  // Log what protobuf thinks the top-level fields are (so we can confirm names without guessing)
  console.log(`[${env.WORKER_NAME}] CQG ClientMsg fields`, Object.keys((ClientMsg as any).fields ?? {}));
  console.log(`[${env.WORKER_NAME}] CQG ServerMsg fields`, Object.keys((ServerMsg as any).fields ?? {}));

  const ws = new WebSocket(CQG.wsUrl);

  let nextReqId = 1;
  const contractIdsBySymbol = new Map<string, number>();
  let loggedOn = false;

  function sendClientMsg(obj: any) {
    const bin = encodeMessage(ClientMsg, obj);
    ws.send(bin);
  }

  function sendLogon() {
    sendClientMsg({
      logon: {
        user_name: CQG.username,
        password: CQG.password,
        client_app_id: CQG.clientAppId,
        client_version: CQG.clientVersion,
        protocol_version_major: CQG.protocolMajor,
        protocol_version_minor: CQG.protocolMinor,
      },
    });
  }

  function sendSymbolResolution(symbol: string) {
    const request_id = nextReqId++;
    sendClientMsg({
      information_request: {
        id: request_id,
        symbol_resolution_request: { symbol },
      },
    });

    console.log(`[${env.WORKER_NAME}] CQG symbol_resolution_request sent`, { request_id, symbol });
  }

  function subscribeMarketData(symbol: string, contract_id: number) {
    const request_id = nextReqId++;
    sendClientMsg({
      market_data_subscription: {
        request_id,
        contract_id,
        level: "LEVEL_1",
        include_quotes: true,
        include_trades: true,
      },
    });

    console.log(`[${env.WORKER_NAME}] CQG market_data_subscription sent`, {
      request_id,
      symbol,
      contract_id,
    });
  }

  ws.on("open", () => {
    console.log(`[${env.WORKER_NAME}] CQG websocket open`);
    sendLogon();
  });

  ws.on("close", (code, reason) => {
    console.log(`[${env.WORKER_NAME}] CQG websocket closed`, {
      code,
      reason: reason?.toString?.() ?? String(reason),
    });
  });

  ws.on("error", (err) => {
    console.error(`[${env.WORKER_NAME}] CQG websocket error`, err);
  });

  ws.on("message", (data) => {
    const msg = decodeMessage(ServerMsg, data);

    // Raw log (keep it, but it’s noisy)
    console.log(`[${env.WORKER_NAME}] CQG RAW`, JSON.stringify(msg));

    // Ping -> Pong
    if (msg.ping) {
      sendClientMsg({ pong: { token: msg.ping.token } });
      console.log(`[${env.WORKER_NAME}] CQG pong sent`);
      return;
    }

    // Logon result
    if (msg.logon_result) {
      console.log(`[${env.WORKER_NAME}] CQG logon_result`, msg.logon_result);

      const rc = Number(msg.logon_result.result_code ?? -1);
      if (rc !== 0) {
        console.error(
          `[${env.WORKER_NAME}] CQG logon failed`,
          { result_code: rc, text_message: msg.logon_result.text_message }
        );
        // Stop here – anything after this will be rejected by the server.
        try { ws.close(); } catch {}
        return;
      }

      loggedOn = true;

      // After success, resolve symbols -> contract_id
      for (const s of CQG.symbols) sendSymbolResolution(s);
      return;
    }

    // If not logged on, ignore everything else
    if (!loggedOn) return;

    // Symbol resolution reports come inside information_reports[] (plural)
    const infoReports = Array.isArray(msg.information_reports) ? msg.information_reports : [];
    for (const ir of infoReports) {
      const rep = ir?.symbol_resolution_report;
      if (!rep) continue;

      const symbol = rep?.contract_metadata?.symbol ?? rep?.symbol ?? "";
      const contract_id = Number(rep?.contract_metadata?.contract_id ?? 0);

      console.log(`[${env.WORKER_NAME}] CQG symbol_resolution_report`, {
        symbol,
        contract_id,
        status_code: rep?.status_code,
      });

      if (symbol && contract_id) {
        contractIdsBySymbol.set(symbol, contract_id);
        subscribeMarketData(symbol, contract_id);
      }
    }

    // Real-time market data is real_time_market_data[] (plural)
    const rtmd = Array.isArray(msg.real_time_market_data) ? msg.real_time_market_data : [];
    for (const upd of rtmd) {
      console.log(`[${env.WORKER_NAME}] CQG RTMD`, {
        contract_id: upd?.contract_id,
        is_snapshot: upd?.is_snapshot,
        quotes: upd?.quote,
        trades: upd?.trade,
      });
    }

    // Market data subscription statuses are also arrays – useful for debugging
    const mdStatuses = Array.isArray(msg.market_data_subscription_statuses)
      ? msg.market_data_subscription_statuses
      : [];
    for (const st of mdStatuses) {
      console.log(`[${env.WORKER_NAME}] CQG market_data_subscription_status`, st);
    }

    const userMsgs = Array.isArray(msg.user_messages) ? msg.user_messages : [];
    for (const um of userMsgs) {
      console.log(`[${env.WORKER_NAME}] CQG user_message`, um);
    }
  });
}
