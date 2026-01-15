import net from "node:net";

export function createRithmicSocket(
  host: string,
  port: number
): net.Socket {
  const socket = new net.Socket();

  socket.setNoDelay(true);
  socket.setKeepAlive(true);

  socket.on("connect", () => {
    console.log("[rithmic-socket] connected");
  });

  socket.on("error", (err) => {
    console.error("[rithmic-socket] error", err);
  });

  socket.on("close", () => {
    console.log("[rithmic-socket] closed");
  });

  socket.connect(port, host);

  return socket;
}
