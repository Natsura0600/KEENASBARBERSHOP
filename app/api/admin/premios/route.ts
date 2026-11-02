import { getConfig } from "@/lib/data";
import { nowAR } from "@/lib/dates";
import { body, guard, json, str } from "@/lib/http";
import {
  deliverReward,
  effectiveStatus,
  ensureClient,
  getClient,
  getLoyalty,
  getReward,
  grantReward,
  listClients,
  listRewards,
  manualText,
  saveClient,
  toAwarded,
  updateReward,
} from "@/lib/loyalty";
import { normalizePhone } from "@/lib/phone";
import { getWaState } from "@/lib/wa-baileys";
import { waStatus } from "@/lib/whatsapp";
import { getSite } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // el aviso por WhatsApp puede tardar unos segundos

export const GET = guard(async () => {
  const [site, rewards, clients, wa] = await Promise.all([getSite({ fresh: true }), listRewards(), listClients(), getWaState()]);
  const { config, loyalty: cfg } = site;
  const today = nowAR().date;
  const byPhone = new Map(clients.map((c) => [c.phone, c]));
  return json({
    whatsapp: waStatus(),
    channel: cfg.channel,
    milestones: cfg.milestones,
    rewardName: cfg.rewardName,
    linked: wa.linked,
    autoSend: cfg.autoSend,
    rewards: rewards.map((r) => ({
      ...r,
      status: effectiveStatus(r, today),
      optIn: byPhone.get(r.phone)?.optIn ?? false,
      manualText: manualText(r, cfg, config.name),
    })),
  });
}, { admin: true });

/** Dar un premio a mano (por ejemplo, a un cliente de toda la vida). */
export const POST = guard(async (req) => {
  const b = await body(req);
  const phone = normalizePhone(str(b.phone, 30));
  if (!phone) return json({ error: "Teléfono inválido. Poné el código de área, por ejemplo 2323 45-6789." }, 400);
  const name = str(b.name, 60);
  const existing = await getClient(phone);
  if (!existing && name.length < 2) return json({ error: "Poné el nombre del cliente." }, 400);
  const client = existing ?? (await ensureClient(phone, name));
  const config = await getConfig();
  const at = b.milestone === undefined || b.milestone === "" ? undefined : Number(b.milestone);
  if (at !== undefined && !(await getLoyalty()).milestones.some((m) => m.at === at)) return json({ error: "Ese premio intermedio no existe." }, 400);
  const reward = await grantReward(client, config.name, at);
  return json({ ok: true, reward, awarded: toAwarded(reward) });
}, { admin: true });

const ACTIONS = ["redeem", "cancel", "restore", "resend", "mark_sent"] as const;

export const PATCH = guard(async (req) => {
  const b = await body(req);
  const action = b.action as (typeof ACTIONS)[number];
  if (!ACTIONS.includes(action)) return json({ error: "Acción inválida" }, 400);
  const r = await getReward(str(b.code, 20));
  if (!r) return json({ error: "Premio no encontrado." }, 404);
  const today = nowAR().date;
  const state = effectiveStatus(r, today);

  if (action === "redeem") {
    if (state !== "pending") return json({ error: "Ese premio no está disponible (canjeado, anulado o vencido)." }, 409);
    r.status = "redeemed";
    r.redeemedAt = new Date().toISOString();
  } else if (action === "cancel") {
    if (r.status !== "pending") return json({ error: "Solo se pueden anular premios pendientes." }, 409);
    r.status = "cancelled";
    const c = await getClient(r.phone);
    if (c) {
      c.earned = Math.max(0, c.earned - 1);
      await saveClient(c);
    }
  } else if (action === "restore") {
    if (r.status === "pending") return json({ error: "Ese premio ya está pendiente." }, 409);
    if (r.redeemedApptId) return json({ error: "Está canjeado en un turno. Deshacé el cobro de ese turno desde la Agenda." }, 409);
    r.status = "pending";
    delete r.redeemedAt;
  } else if (action === "mark_sent") {
    r.send = { via: "manual", at: new Date().toISOString(), ok: true };
  } else if (action === "resend") {
    if (state !== "pending") return json({ error: "Solo se reenvían premios pendientes." }, 409);
    const c = await getClient(r.phone);
    if (!c?.optIn) return json({ error: "Este cliente no aceptó recibir avisos por WhatsApp. Usá “Avisar por WhatsApp” (manual)." }, 409);
    const cfg = await getLoyalty();
    const config = await getConfig();
    const sent = await deliverReward(r, c, cfg, config.name, true);
    return json({ ok: !sent.send || sent.send.ok, reward: sent, error: sent.send?.ok === false ? sent.send.error : undefined });
  }
  await updateReward(r);
  return json({ ok: true, reward: r });
}, { admin: true });
