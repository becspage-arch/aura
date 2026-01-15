import WebSocket from "ws";

export function createRithmicWs(url: string): WebSocket {
  const ws = new WebSocket(url);

  ws.on("open", () => console.log("[rithmic-ws] open"));
  ws.on("error", (e) => console.error("[rithmic-ws] error", e));
  ws.on("close", () => console.log("[rithmic-ws] close"));

  return ws;
}
