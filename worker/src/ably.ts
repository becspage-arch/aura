import Ably from "ably";
import { env } from "./env.js";

export function createAblyRealtime() {
  return new Ably.Realtime({ key: env.ABLY_API_KEY });
}
