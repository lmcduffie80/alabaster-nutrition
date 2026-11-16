import "server-only";
import { sign } from "node:crypto";
import { connect } from "node:http2";

export type PushMessage = { title: string; body: string; path: string };

const BUNDLE_ID = process.env.APNS_BUNDLE_ID || "com.alabasternutrition.app";
const HOST = process.env.APNS_SANDBOX === "1" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
/** Apple rejects tokens older than an hour and throttles ones refreshed more often than every 20 minutes. */
const TOKEN_MINUTES = 45;

let cached: { jwt: string; at: number } | null = null;

const base64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function providerToken(now = Date.now()): string | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const key = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!keyId || !teamId || !key) return null;
  if (cached && now - cached.at < TOKEN_MINUTES * 60_000) return cached.jwt;
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  cached = { jwt: `${header}.${claims}.${base64url(signature)}`, at: now };
  return cached.jwt;
}

export function isDeviceToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64,200}$/i.test(value);
}

/**
 * Sends one alert to each device through APNs. Never throws: problems are logged. Returns the tokens Apple
 * says are no longer valid, so they can be forgotten.
 */
export async function sendPush(tokens: string[], message: PushMessage): Promise<{ invalid: string[] }> {
  if (tokens.length === 0) return { invalid: [] };
  let jwt: string | null;
  try {
    jwt = providerToken();
  } catch (error) {
    console.error("APNs key couldn't sign a token", error);
    return { invalid: [] };
  }
  if (!jwt) {
    console.warn("APNS_KEY_ID, APNS_TEAM_ID or APNS_PRIVATE_KEY isn't set; skipped a push.");
    return { invalid: [] };
  }

  const payload = JSON.stringify({ aps: { alert: { title: message.title, body: message.body }, sound: "default" }, path: message.path });
  const invalid: string[] = [];
  const session = connect(HOST);
  session.on("error", (error) => console.error("APNs connection failed", error));
  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const request = session.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              authorization: `bearer ${jwt}`,
              "apns-topic": BUNDLE_ID,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "content-type": "application/json",
            });
            let status = 0;
            let body = "";
            request.setTimeout(10_000, () => request.close());
            request.on("response", (headers) => (status = Number(headers[":status"])));
            request.on("data", (chunk) => (body += chunk));
            request.on("end", () => {
              if (status === 410 || (status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(body))) invalid.push(token);
              else if (status !== 200) console.error(`APNs refused a push (${status}): ${body.slice(0, 200)}`);
              resolve();
            });
            request.on("error", (error) => {
              console.error("APNs request failed", error);
              resolve();
            });
            request.end(payload);
          }),
      ),
    );
  } finally {
    session.close();
  }
  return { invalid };
}
