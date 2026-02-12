// src/lib/push/apns.ts
import { SignJWT, importPKCS8 } from "jose";

type ApnsEnv = "sandbox" | "production";

function mustGet(name: string) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function makeApnsJwt() {
  const teamId = mustGet("APNS_TEAM_ID");
  const keyId = mustGet("APNS_KEY_ID");

  // Store the .p8 as base64 in env (no newline problems)
  const p8 = Buffer.from(mustGet("APNS_AUTH_KEY_BASE64"), "base64").toString("utf8");

  const privateKey = await importPKCS8(p8, "ES256");

  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

export async function sendApnsPush(params: {
  env: ApnsEnv;
  deviceToken: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}) {
  const bundleId = mustGet("APNS_BUNDLE_ID");

  const host =
    params.env === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  const jwt = await makeApnsJwt();

  const url = `${host}/3/device/${params.deviceToken}`;

  const payload = {
    aps: {
      alert: { title: params.title, body: params.body },
      sound: "default",
    },
    ...(params.data ? { data: params.data } : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`APNS_HTTP_${res.status}: ${text.slice(0, 300)}`);
  }

  return { ok: true as const };
}
