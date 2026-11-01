import { randomBytes } from "node:crypto";
import { getStore, getStoreOrNull, keys } from "./db";
import { DEFAULT_CONFIG, DEFAULT_NOTICES, DEFAULT_SERVICES } from "./defaults";
import {
  addDays,
  dow,
  fromMin,
  listDays,
  monthRange,
  monthsBetween,
  nowAR,
  toMin,
  weekRange,
} from "./dates";
import type { Appointment, CashEntry, Config, Notice, PayMethod, Service } from "./types";

export const newId = (prefix = "") => prefix + randomBytes(6).toString("hex");

/* ------------------------------------------------------------------ */
/* Config, servicios y avisos (la web pública tolera que no haya DB)    */
/* ------------------------------------------------------------------ */

export async function getConfig(): Promise<Config> {
  try {
    const stored = await getStoreOrNull()?.get<Partial<Config>>(keys.config);
    return { ...DEFAULT_CONFIG, ...(stored ?? {}), hours: { ...DEFAULT_CONFIG.hours, ...(stored?.hours ?? {}) } };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function getServices(): Promise<Service[]> {
  try {
    const stored = await getStoreOrNull()?.get<Service[]>(keys.services);
    return Array.isArray(stored) ? stored : DEFAULT_SERVICES;
  } catch {
    return DEFAULT_SERVICES;
  }
}

export async function getNotices(onlyVisible = false): Promise<Notice[]> {
  let list = DEFAULT_NOTICES;
  try {
    const stored = await getStoreOrNull()?.get<Notice[]>(keys.notices);
    if (Array.isArray(stored)) list = stored;
  } catch {
    /* usa los avisos por defecto */
  }
  if (!onlyVisible) return list;
  const today = nowAR().date;
  return list.filter((n) => n.active && (!n.expiresOn || n.expiresOn >= today));
}

/* ------------------------------------------------------------------ */
/* Horarios y disponibilidad                                            */
/* ------------------------------------------------------------------ */

export function daySlots(config: Config, date: string): string[] {
  const h = config.hours[String(dow(date))];
  if (!h) return [];
  const open = toMin(h.open);
  const close = toMin(h.close);
  const step = Math.max(10, config.slotMinutes);
  const out: string[] = [];
  for (let t = open; t + step <= close; t += step) out.push(fromMin(t));
  return out;
}

export function slotsNeeded(duration: number, step: number) {
  return Math.max(1, Math.ceil(duration / Math.max(10, step)));
}

export function serviceAllowedOn(service: Service, date: string) {
  return !service.onlyDays?.length || service.onlyDays.includes(dow(date));
}

export async function appointmentsOf(date: string): Promise<Appointment[]> {
  const all = await getStore().hgetall<Appointment>(keys.day(date));
  return Object.values(all).sort((a, b) => a.time.localeCompare(b.time));
}

const BUSY: Appointment["status"][] = ["reserved", "done", "noshow"];

export async function availability(config: Config, service: Service, date: string, forAdmin = false) {
  const all = daySlots(config, date);
  if (!all.length || !serviceAllowedOn(service, date)) return { closed: true, slots: [] as { time: string; free: boolean }[] };

  const taken = new Set<string>();
  for (const a of await appointmentsOf(date)) {
    if (BUSY.includes(a.status)) a.slots.forEach((s) => taken.add(s));
  }
  const need = slotsNeeded(service.duration, config.slotMinutes);
  const now = nowAR();

  const slots = all.map((time, i) => {
    const run = all.slice(i, i + need);
    let free = run.length === need && run.every((t) => !taken.has(t));
    if (free && !forAdmin) {
      if (date < now.date) free = false;
      if (date === now.date && toMin(time) < now.minutes + 10) free = false;
    }
    return { time, free };
  });
  return { closed: false, slots };
}

/* ------------------------------------------------------------------ */
/* Reservas                                                             */
/* ------------------------------------------------------------------ */

export class BookingError extends Error {}

const LOCK_TTL = 60 * 60 * 24 * 90;

export async function createAppointment(input: {
  config: Config;
  service: Service;
  date: string;
  time: string;
  name: string;
  phone: string;
  source: "web" | "admin";
}): Promise<Appointment> {
  const { config, service, date, time, name, phone, source } = input;
  const db = getStore();
  const all = daySlots(config, date);
  const start = all.indexOf(time);
  const need = slotsNeeded(service.duration, config.slotMinutes);
  const run = start >= 0 ? all.slice(start, start + need) : [];
  if (run.length !== need) throw new BookingError("Ese horario no está disponible.");

  const id = newId("t_");
  const acquired: string[] = [];
  for (const t of run) {
    const ok = await db.set(keys.lock(date, t), id, { nx: true, ex: LOCK_TTL });
    if (!ok) {
      await db.del(...acquired.map((a) => keys.lock(date, a)));
      throw new BookingError("Ese horario se acaba de ocupar. Elegí otro.");
    }
    acquired.push(t);
  }

  const appt: Appointment = {
    id,
    date,
    time,
    slots: run,
    serviceId: service.id,
    serviceName: service.name,
    price: service.price,
    duration: service.duration,
    name,
    phone,
    status: "reserved",
    source,
    createdAt: new Date().toISOString(),
  };
  try {
    await db.hset(keys.day(date), id, appt);
  } catch (e) {
    await db.del(...run.map((t) => keys.lock(date, t)));
    throw e;
  }
  return appt;
}

export async function releaseSlots(appt: Appointment) {
  await getStore().del(...appt.slots.map((t) => keys.lock(appt.date, t)));
}

/* ------------------------------------------------------------------ */
/* Caja                                                                 */
/* ------------------------------------------------------------------ */

export async function saveCashEntry(entry: CashEntry) {
  await getStore().hset(keys.cash(entry.date.slice(0, 7)), entry.id, entry);
}

export async function deleteCashEntry(date: string, id: string) {
  await getStore().hdel(keys.cash(date.slice(0, 7)), id);
}

export async function cashBetween(start: string, end: string): Promise<CashEntry[]> {
  const db = getStore();
  const lists = await Promise.all(
    monthsBetween(start, end).map((m) => db.hgetall<CashEntry>(keys.cash(m))),
  );
  return lists
    .flatMap((h) => Object.values(h))
    .filter((e) => e.date >= start && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export type CashSummary = {
  mode: "week" | "month";
  start: string;
  end: string;
  prevRef: string;
  nextRef: string;
  entries: CashEntry[];
  totals: {
    ingresos: number;
    egresos: number;
    neto: number;
    cortes: number;
    ticket: number;
    byMethod: Record<PayMethod, number>;
  };
  days: { date: string; ingresos: number; egresos: number }[];
  byConcept: { concept: string; total: number; count: number }[];
};

export async function cashSummary(mode: "week" | "month", ref: string): Promise<CashSummary> {
  const range = mode === "week" ? weekRange(ref) : monthRange(ref);
  const entries = await cashBetween(range.start, range.end);

  const totals = {
    ingresos: 0,
    egresos: 0,
    neto: 0,
    cortes: 0,
    ticket: 0,
    byMethod: { efectivo: 0, transferencia: 0, otro: 0 } as Record<PayMethod, number>,
  };
  const perDay = new Map<string, { ingresos: number; egresos: number }>();
  for (const d of listDays(range.start, range.end)) perDay.set(d, { ingresos: 0, egresos: 0 });
  const concepts = new Map<string, { total: number; count: number }>();

  for (const e of entries) {
    const day = perDay.get(e.date);
    if (e.type === "ingreso") {
      totals.ingresos += e.amount;
      totals.byMethod[e.method] += e.amount;
      if (e.appointmentId) totals.cortes += 1;
      if (day) day.ingresos += e.amount;
      const c = concepts.get(e.concept) ?? { total: 0, count: 0 };
      c.total += e.amount;
      c.count += 1;
      concepts.set(e.concept, c);
    } else {
      totals.egresos += e.amount;
      if (day) day.egresos += e.amount;
    }
  }
  totals.neto = totals.ingresos - totals.egresos;
  totals.ticket = totals.cortes ? Math.round(totals.ingresos / totals.cortes) : 0;

  const prevRef = addDays(range.start, -1);
  const nextRef = addDays(range.end, 1);

  return {
    mode,
    ...range,
    prevRef,
    nextRef,
    entries,
    totals,
    days: [...perDay.entries()].map(([date, v]) => ({ date, ...v })),
    byConcept: [...concepts.entries()]
      .map(([concept, v]) => ({ concept, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}
