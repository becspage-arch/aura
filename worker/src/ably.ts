import Ably from "ably";
import { env } from "./env";

export function createAblyRealtime() {
  return new Ably.Realtime({ key: env.ABLY_API_KEY });
}
