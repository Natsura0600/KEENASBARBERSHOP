import { randomInt } from "node:crypto";
import { addDays, nowAR } from "./dates";
import { BookingError } from "./data";
import { getStore, getStoreOrNull, keys } from "./db";
import { DEFAULT_LOYALTY } from "./defaults";
import { normalizePhone } from "./phone";
import { sendTemplate } from "./whatsapp";
import type { Appointment, Client, LoyaltyConfig, Milestone, Reward, TemplateVar } from "./types";

import { TEMPLATE_VARS } from "./loyalty-shared";
export { suggestedTemplateText, TEMPLATE_VARS } from "./loyalty-shared";

/* ------------------------------------------------------------------ */
/* Configuración                                                        */
/* ------------------------------------------------------------------ */

export function mergeLoyalty(s?: Partial<LoyaltyConfig> | null): LoyaltyConfig {
  return {
    ...DEFAULT_LOYALTY,
    ...(s ?? {}),
    template: { ...DEFAULT_LOYALTY.template, ...(s?.template ?? {}) },
    stamps: { ...(s?.stamps ?? {}) },
    milestones: Array.isArray(s?.milestones) ? s!.milestones : DEFAULT_LOYALTY.milestones,
  };
}

/** La web pública tolera que no haya base de datos: en ese caso la tarjeta queda apagada. */
export async function getLoyalty(): Promise<LoyaltyConfig> {
  try {
    return mergeLoyalty(await getStoreOrNull()?.get<Partial<LoyaltyConfig>>(keys.loyalty));
  } catch {
    return DEFAULT_LOYALTY;
  }
}

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function cleanLoyalty(b: Record<string, unknown>, current: LoyaltyConfig, serviceIds: string[]): LoyaltyConfig {
  const rawStamps = (b.stamps ?? {}) as Record<string, unknown>;
  const stamps: Record<string, number> = {};
  for (const id of serviceIds) {
    const n = int(rawStamps[id], 0, 10, 1);
    if (n !== 1) stamps[id] = n; // solo se guarda lo que se aparta del valor por defecto
  }
  const t = (b.template ?? {}) as Record<string, unknown>;
  const vars = Array.isArray(t.vars)
    ? (t.vars as unknown[]).filter((v): v is TemplateVar => TEMPLATE_VARS.includes(v as TemplateVar)).slice(0, 5)
    : current.template.vars;
  const name = text(t.name, 120).toLowerCase();
  const language = text(t.language, 10);
  const cutsRequired = int(b.cutsRequired, 2, 50, current.cutsRequired);
  const seen = new Set<number>();
  const milestones: Milestone[] = (Array.isArray(b.milestones) ? (b.milestones as Record<string, unknown>[]) : current.milestones)
    .map((m) => ({ at: int(m?.at, 1, 49, 0), name: text(m?.name, 80), percent: int(m?.percent, 0, 100, 0) }))
    .filter((m) => m.at >= 1 && m.at < cutsRequired && m.name && !seen.has(m.at) && seen.add(m.at))
    .sort((a, c) => a.at - c.at)
    .slice(0, 5);
  return {
    enabled: b.enabled === true,
    cutsRequired,
    milestones,
    rewardName: text(b.rewardName, 80) || current.rewardName,
    validDays: int(b.validDays, 0, 730, current.validDays),
    stamps,
    channel: b.channel === "api" ? "api" : "baileys",
    autoSend: b.autoSend !== false,
    template: {
      name: /^[a-z0-9_]{1,120}$/.test(name) ? name : current.template.name,
      language: /^[a-z]{2}(_[A-Z]{2})?$/.test(language) ? language : current.template.language,
      vars,
    },
    manualMessage: text(b.manualMessage, 600) || current.manualMessage,
  };
}

/* ------------------------------------------------------------------ */
/* Clientes                                                             */
/* ------------------------------------------------------------------ */

export async function getClient(phone: string): Promise<Client | null> {
  return getStore().hget<Client>(keys.clients, phone);
}

export async function saveClient(c: Client) {
  await getStore().hset(keys.clients, c.phone, c);
}

export async function listClients(): Promise<Client[]> {
  return Object.values(await getStore().hgetall<Client>(keys.clients));
}

export async function ensureClient(phone: string, name: string): Promise<Client> {
  const found = await getClient(phone);
  if (found) {
    if (!found.name && name) {
      found.name = name;
      await saveClient(found);
    }
    return found;
  }
  const c: Client = {
    phone,
    name,
    stamps: 0,
    total: 0,
    earned: 0,
    optIn: false,
    createdAt: new Date().toISOString(),
  };
  await saveClient(c);
  return c;
}

export async function setOptIn(phone: string, name: string, value: boolean, source: "web" | "admin") {
  const c = await ensureClient(phone, name);
  if (c.optIn === value) return c;
  c.optIn = value;
  c.optInAt = new Date().toISOString();
  c.optInSource = source;
  await saveClient(c);
  return c;
}

/* ------------------------------------------------------------------ */
/* Premios                                                              */
/* ------------------------------------------------------------------ */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para no confundir al dictar

export function effectiveStatus(r: Reward, today: string): Reward["status"] | "expired" {
  if (r.status === "pending" && r.expiresOn && r.expiresOn < today) return "expired";
  return r.status;
}

export async function listRewards(): Promise<Reward[]> {
  const all = Object.values(await getStore().hgetall<Reward>(keys.rewards));
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getReward(code: string): Promise<Reward | null> {
  return getStore().hget<Reward>(keys.rewards, code.toUpperCase().trim());
}

async function saveReward(r: Reward) {
  await getStore().hset(keys.rewards, r.code, r);
}

async function newCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    let c = "";
    for (let k = 0; k < 6; k++) c += ALPHABET[randomInt(ALPHABET.length)];
    const code = `${c.slice(0, 3)}-${c.slice(3)}`;
    if (!(await getStore().hget(keys.rewards, code))) return code;
  }
  throw new Error("No se pudo generar un código único");
}

async function createReward(client: Client, cfg: LoyaltyConfig, fromApptId?: string, m?: Milestone): Promise<Reward> {
  const r: Reward = {
    code: await newCode(),
    phone: client.phone,
    name: client.name,
    reward: m ? m.name : cfg.rewardName,
    ...(m ? { milestone: m.at, ...(m.percent > 0 ? { percent: m.percent } : {}) } : {}),
    createdAt: new Date().toISOString(),
    ...(cfg.validDays > 0 ? { expiresOn: addDays(nowAR().date, cfg.validDays) } : {}),
    status: "pending",
    ...(fromApptId ? { fromApptId } : {}),
  };
  await saveReward(r);
  client.earned += 1;
  return r;
}

/* ---- textos del mensaje ---- */

const fmtDate = (d: string) => d.split("-").reverse().join("/");
export const firstName = (n: string) => {
  const f = n.trim().split(/\s+/)[0] ?? "";
  return f ? f[0].toUpperCase() + f.slice(1).toLowerCase() : "";
};

export function varValues(r: Reward, cfg: LoyaltyConfig, shop: string): Record<TemplateVar, string> {
  return {
    nombre: firstName(r.name) || "cliente",
    premio: r.reward,
    codigo: r.code,
    vencimiento: r.expiresOn ? fmtDate(r.expiresOn) : "sin vencimiento",
    negocio: shop,
    sellos: String(cfg.cutsRequired),
  };
}

export function manualText(r: Reward, cfg: LoyaltyConfig, shop: string): string {
  const v = varValues(r, cfg, shop);
  return cfg.manualMessage.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k as TemplateVar] : m));
}

/* ---- envío ---- */

/** Manda el aviso por la API. Si el cliente no aceptó o el envío automático está apagado, no hace nada. */
export async function deliverReward(r: Reward, client: Client, cfg: LoyaltyConfig, shop: string, force = false): Promise<Reward> {
  if (!force && (!cfg.autoSend || !client.optIn)) return r;
  if (cfg.channel === "baileys") {
    // Número vinculado con QR: texto normal, sin plantilla.
    const { sendWhatsAppText } = await import("./wa-baileys");
    const res = await sendWhatsAppText(client.phone, manualText(r, cfg, shop));
    r.send = {
      via: res.simulated ? "simulated" : "baileys",
      at: new Date().toISOString(),
      ok: res.ok,
      ...(res.error ? { error: res.error } : {}),
      ...(res.id ? { wamid: res.id } : {}),
    };
    await saveReward(r);
    return r;
  }
  const v = varValues(r, cfg, shop);
  const res = await sendTemplate({
    to: client.phone,
    name: cfg.template.name,
    language: cfg.template.language,
    params: cfg.template.vars.map((k) => v[k]),
  });
  r.send = {
    via: res.simulated ? "simulated" : "whatsapp",
    at: new Date().toISOString(),
    ok: res.ok,
    ...(res.error ? { error: res.error } : {}),
    ...(res.id ? { wamid: res.id } : {}),
  };
  await saveReward(r);
  return r;
}

/* ------------------------------------------------------------------ */
/* Sellos                                                               */
/* ------------------------------------------------------------------ */

export type Awarded = { code: string; reward: string; sent: "whatsapp" | "simulated" | "error" | "no" };

/** Completa tarjetas mientras haya sellos de sobra (los sobrantes pasan a la tarjeta siguiente). */
async function completeCards(client: Client, cfg: LoyaltyConfig, shop: string, fromApptId?: string): Promise<Reward[]> {
  const out: Reward[] = [];
  let guard = 0;
  while (client.stamps >= cfg.cutsRequired && guard++ < 5) {
    client.stamps -= cfg.cutsRequired;
    out.push(await createReward(client, cfg, fromApptId));
  }
  await saveClient(client);
  for (const r of out) await deliverReward(r, client, cfg, shop);
  return out;
}

const sentState = (r: Reward): Awarded["sent"] => (!r.send ? "no" : !r.send.ok ? "error" : r.send.via === "simulated" ? "simulated" : "whatsapp");
export const toAwarded = (r: Reward): Awarded => ({ code: r.code, reward: r.reward, sent: sentState(r) });

/** Suma sellos de a uno: cada hito que se cruza da su premio y, al completar la tarjeta, se reinicia (los sobrantes siguen). */
async function applyStamps(client: Client, n: number, cfg: LoyaltyConfig, shop: string, apptId?: string): Promise<Reward[]> {
  const out: Reward[] = [];
  for (let i = 0; i < n; i++) {
    client.stamps += 1;
    for (const m of cfg.milestones) {
      if (m.at === client.stamps && m.at < cfg.cutsRequired) out.push(await createReward(client, cfg, apptId, m));
    }
    if (client.stamps >= cfg.cutsRequired) {
      client.stamps -= cfg.cutsRequired;
      out.push(await createReward(client, cfg, apptId));
    }
  }
  await saveClient(client);
  for (const r of out) await deliverReward(r, client, cfg, shop);
  return out;
}

/** Se llama cuando un turno pasa a "cobrado". */
export async function addStampsFor(appt: Appointment, shop: string) {
  const cfg = await getLoyalty();
  if (!cfg.enabled) return { loyalty: undefined, awarded: [] as Awarded[] };
  const phone = normalizePhone(appt.phone);
  if (!phone) return { loyalty: undefined, awarded: [] as Awarded[] };
  const n = Math.min(cfg.stamps[appt.serviceId] ?? 1, 10);
  if (n <= 0) return { loyalty: undefined, awarded: [] as Awarded[] };

  const client = await ensureClient(phone, appt.name);
  client.total += n;
  client.lastVisit = appt.date;
  const rewards = await applyStamps(client, n, cfg, shop, appt.id);
  return {
    loyalty: { stamps: n, rewards: rewards.map((r) => r.code) } as NonNullable<Appointment["loyalty"]>,
    awarded: rewards.map(toAwarded),
  };
}

/** Se llama cuando un turno deja de estar cobrado (deshacer, cancelar). */
export async function revertLoyalty(appt: Appointment) {
  const l = appt.loyalty;
  if (!l) return;
  const db = getStore();

  if (l.redeemed) {
    const r = await getReward(l.redeemed);
    if (r && r.status === "redeemed" && r.redeemedApptId === appt.id) {
      r.status = "pending";
      delete r.redeemedAt;
      delete r.redeemedApptId;
      await saveReward(r);
    }
  }
  if (!l.stamps && !l.rewards.length) return;

  const phone = normalizePhone(appt.phone);
  const client = phone ? await getClient(phone) : null;
  if (!client) return;
  const rewards = (await Promise.all(l.rewards.map(getReward))).filter((r): r is Reward => !!r);
  // Si algún premio de este corte ya se canjeó, no se toca nada: es irreversible.
  if (rewards.some((r) => r.status !== "pending")) return;

  const cfg = await getLoyalty();
  for (const r of rewards) {
    r.status = "cancelled";
    await saveReward(r);
    client.earned = Math.max(0, client.earned - 1);
    // Solo completar la tarjeta reinicia los sellos; un premio intermedio no los toca.
    if (r.milestone === undefined) client.stamps += cfg.cutsRequired;
  }
  client.stamps = Math.max(0, client.stamps - l.stamps);
  client.total = Math.max(0, client.total - l.stamps);
  await db.hset(keys.clients, client.phone, client);
}

/** Canje al cobrar un turno. Lanza BookingError si el código no sirve para este cliente. */
export async function redeemFor(code: string, appt: Appointment): Promise<Reward> {
  const r = await getReward(code);
  const phone = normalizePhone(appt.phone);
  if (!r || !phone || r.phone !== phone) throw new BookingError("Ese código no corresponde a este cliente.");
  if (effectiveStatus(r, nowAR().date) !== "pending") throw new BookingError("Ese premio ya no está disponible (canjeado, anulado o vencido).");
  r.status = "redeemed";
  r.redeemedAt = new Date().toISOString();
  r.redeemedApptId = appt.id;
  await saveReward(r);
  return r;
}

/* ------------------------------------------------------------------ */
/* Ajustes manuales desde el panel                                       */
/* ------------------------------------------------------------------ */

export async function adjustStamps(client: Client, newStamps: number, shop: string): Promise<Reward[]> {
  const cfg = await getLoyalty();
  const delta = newStamps - client.stamps;
  client.stamps = Math.max(0, newStamps);
  if (delta > 0) client.total += delta;
  return completeCards(client, cfg, shop);
}

export async function grantReward(client: Client, shop: string, milestoneAt?: number): Promise<Reward> {
  const cfg = await getLoyalty();
  const m = milestoneAt === undefined ? undefined : cfg.milestones.find((x) => x.at === milestoneAt);
  const r = await createReward(client, cfg, undefined, m);
  await saveClient(client);
  return deliverReward(r, client, cfg, shop);
}

export async function updateReward(r: Reward) {
  await saveReward(r);
}
