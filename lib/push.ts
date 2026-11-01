import { createHash } from "node:crypto";
import webpush from "web-push";
import { getStore, keys } from "./db";

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string }; ua?: string; createdAt: string };

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY?.trim() || "";
export const pushConfigured = () => Boolean(pushPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com",
    pushPublicKey(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  ready = true;
}

const idOf = (endpoint: string) => createHash("sha1").update(endpoint).digest("hex");

export function validSub(v: unknown): v is PushSub {
  const s = v as PushSub;
  return (
    !!s &&
    typeof s.endpoint === "string" &&
    s.endpoint.startsWith("https://") &&
    s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string"
  );
}

export async function saveSub(sub: PushSub, ua = "") {
  await getStore().hset(keys.push, idOf(sub.endpoint), {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    ua: ua.slice(0, 160),
    createdAt: new Date().toISOString(),
  });
}

export async function removeSub(endpoint: string) {
  await getStore().hdel(keys.push, idOf(endpoint));
}

export async function listSubs(): Promise<PushSub[]> {
  const all = (await getStore().hgetall(keys.push)) ?? {};
  return Object.values(all) as PushSub[];
}

export type PushResult = { sent: number; failed: number; removed: number; error?: string };

/** Manda un aviso a todos los dispositivos del panel. Nunca tira error: una reserva no debe fallar por un aviso. */
export async function notifyAdmins(msg: { title: string; body: string; tag?: string; url?: string }): Promise<PushResult> {
  const out: PushResult = { sent: 0, failed: 0, removed: 0 };
  if (!pushConfigured()) return { ...out, error: "Faltan las claves VAPID." };
  try {
    setup();
    const subs = await listSubs();
    const payload = JSON.stringify({ url: "/admin", ...msg });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(s, payload, { TTL: 60 * 60 * 12, urgency: "high", timeout: 8000 });
          out.sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await removeSub(s.endpoint).catch(() => {});
            out.removed++;
          } else {
            out.failed++;
            out.error = (e as Error).message?.slice(0, 160);
          }
        }
      }),
    );
  } catch (e) {
    out.failed++;
    out.error = (e as Error).message?.slice(0, 160);
  }
  return out;
}
