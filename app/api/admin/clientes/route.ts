import { getConfig } from "@/lib/data";
import { getStore, keys } from "@/lib/db";
import { nowAR } from "@/lib/dates";
import { body, guard, json, str } from "@/lib/http";
import {
  adjustStamps,
  effectiveStatus,
  ensureClient,
  getClient,
  getLoyalty,
  listClients,
  listRewards,
  toAwarded,
  updateReward,
} from "@/lib/loyalty";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // el aviso por WhatsApp puede tardar unos segundos

export const GET = guard(async () => {
  const [clients, rewards, cfg] = await Promise.all([listClients(), listRewards(), getLoyalty()]);
  const today = nowAR().date;
  const pending = new Map<string, number>();
  for (const r of rewards) if (effectiveStatus(r, today) === "pending") pending.set(r.phone, (pending.get(r.phone) ?? 0) + 1);
  const list = clients
    .map((c) => ({ ...c, pending: pending.get(c.phone) ?? 0 }))
    .sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "") || a.name.localeCompare(b.name));
  return json({ clients: list, required: cfg.cutsRequired, enabled: cfg.enabled });
}, { admin: true });

/** Crea o actualiza un cliente (nombre, sellos, consentimiento). */
async function upsert(req: Request, mustExist: boolean) {
  const b = await body(req);
  const phone = normalizePhone(str(b.phone, 30));
  if (!phone) return json({ error: "Teléfono inválido. Poné el código de área, por ejemplo 2323 45-6789." }, 400);
  const existing = await getClient(phone);
  if (mustExist && !existing) return json({ error: "Cliente no encontrado." }, 404);

  const shop = (await getConfig()).name;
  const name = str(b.name, 60);
  if (!existing && name.length < 2) return json({ error: "Poné el nombre del cliente." }, 400);

  const client = existing ?? (await ensureClient(phone, name));
  if (name) client.name = name;
  const fresh = (await getClient(phone)) ?? client;
  if (name) fresh.name = name;

  let awarded: ReturnType<typeof toAwarded>[] = [];
  if (b.stamps !== undefined) {
    const n = Math.round(Number(b.stamps));
    if (!Number.isFinite(n) || n < 0 || n > 500) return json({ error: "Sellos inválidos." }, 400);
    awarded = (await adjustStamps(fresh, n, shop)).map(toAwarded);
  } else {
    await getStore().hset(keys.clients, fresh.phone, fresh);
  }
  return json({ ok: true, client: await getClient(phone), awarded });
}

export const POST = guard((req) => upsert(req, false), { admin: true });
export const PATCH = guard((req) => upsert(req, true), { admin: true });

export const DELETE = guard(async (req) => {
  const phone = normalizePhone(new URL(req.url).searchParams.get("phone") ?? "");
  if (!phone) return json({ error: "Teléfono inválido" }, 400);
  // Los premios pendientes de un cliente borrado se anulan para que nadie los pueda canjear.
  for (const r of await listRewards()) {
    if (r.phone === phone && r.status === "pending") {
      r.status = "cancelled";
      await updateReward(r);
    }
  }
  await getStore().hdel(keys.clients, phone);
  return json({ ok: true });
}, { admin: true });
