import {
  BookingError,
  appointmentsOf,
  availability,
  createAppointment,
  deleteCashEntry,
  getConfig,
  getServices,
  releaseSlots,
  saveCashEntry,
} from "@/lib/data";
import { getStore, keys } from "@/lib/db";
import { isValidDate, isValidTime, nowAR } from "@/lib/dates";
import { body, guard, json, money, str } from "@/lib/http";
import {
  addStampsFor,
  effectiveStatus,
  getLoyalty,
  listClients,
  listRewards,
  redeemFor,
  revertLoyalty,
  type Awarded,
} from "@/lib/loyalty";
import { normalizePhone } from "@/lib/phone";
import type { Appointment, AppointmentStatus, PayMethod } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // el aviso por WhatsApp puede tardar unos segundos

export type AgendaCard = {
  stamps: number;
  optIn: boolean;
  rewards: { code: string; reward: string; percent?: number; expiresOn?: string }[];
};

export const GET = guard(async (req) => {
  const date = new URL(req.url).searchParams.get("date") ?? nowAR().date;
  if (!isValidDate(date)) return json({ error: "Fecha inválida" }, 400);
  const [config, services, appointments, loyalty] = await Promise.all([
    getConfig(),
    getServices(),
    appointmentsOf(date),
    getLoyalty(),
  ]);
  // Horarios libres por servicio, para cargar turnos a mano.
  const free: Record<string, string[]> = {};
  for (const s of services.filter((x) => x.active)) {
    const av = await availability(config, s, date, true);
    free[s.id] = av.slots.filter((x) => x.free).map((x) => x.time);
  }

  // Estado de la tarjeta de cada cliente que tiene turno ese día.
  const cards: Record<string, AgendaCard> = {};
  if (loyalty.enabled) {
    const [clients, rewards] = await Promise.all([listClients(), listRewards()]);
    const byPhone = new Map(clients.map((c) => [c.phone, c]));
    const today = nowAR().date;
    for (const a of appointments) {
      const phone = normalizePhone(a.phone);
      if (!phone) continue;
      const c = byPhone.get(phone);
      cards[a.id] = {
        stamps: c?.stamps ?? 0,
        optIn: c?.optIn ?? false,
        rewards: rewards
          .filter((r) => r.phone === phone && effectiveStatus(r, today) === "pending")
          .map((r) => ({ code: r.code, reward: r.reward, percent: r.percent, expiresOn: r.expiresOn })),
      };
    }
  }
  return json({
    date,
    appointments,
    free,
    loyalty: { enabled: loyalty.enabled, required: loyalty.cutsRequired },
    cards,
  });
}, { admin: true });

// Cargar un turno a mano (cliente que escribió por WhatsApp, por ejemplo)
export const POST = guard(async (req) => {
  const b = await body(req);
  const { date, time, serviceId } = b;
  if (!isValidDate(date) || !isValidTime(time)) return json({ error: "Fecha u hora inválida." }, 400);
  const name = str(b.name, 60);
  if (name.length < 2) return json({ error: "Poné el nombre del cliente." }, 400);
  const phone = str(b.phone, 30).replace(/[^\d+]/g, "");

  const [config, services] = await Promise.all([getConfig(), getServices()]);
  const service = services.find((s) => s.id === serviceId);
  if (!service) return json({ error: "Servicio inválido." }, 400);

  const av = await availability(config, service, date, true);
  if (!av.slots.find((s) => s.time === time && s.free)) {
    throw new BookingError("Ese horario no está libre.");
  }
  const appt = await createAppointment({ config, service, date, time, name, phone, source: "admin" });
  return json({ ok: true, appointment: appt });
}, { admin: true });

const STATUSES: AppointmentStatus[] = ["reserved", "done", "cancelled", "noshow"];
const METHODS: PayMethod[] = ["efectivo", "transferencia", "otro"];

export const PATCH = guard(async (req) => {
  const b = await body(req);
  const { date, id, status } = b;
  if (!isValidDate(date) || typeof id !== "string") return json({ error: "Datos inválidos" }, 400);
  if (!STATUSES.includes(status as AppointmentStatus)) return json({ error: "Estado inválido" }, 400);

  const db = getStore();
  const appt = await db.hget<Appointment>(keys.day(date), id);
  if (!appt) return json({ error: "Turno no encontrado" }, 404);

  const next = status as AppointmentStatus;
  const cashId = `c_${appt.id}`;
  const wasDone = appt.status === "done";
  const wasCancelled = appt.status === "cancelled";

  if (wasCancelled && next !== "cancelled") {
    // Reactivar un turno cancelado: hay que volver a tomar los horarios.
    const got: string[] = [];
    for (const t of appt.slots) {
      const ok = await db.set(keys.lock(appt.date, t), appt.id, { nx: true, ex: 60 * 60 * 24 * 90 });
      if (!ok) {
        await db.del(...got.map((g) => keys.lock(appt.date, g)));
        throw new BookingError("Ese horario ya lo tomó otra persona.");
      }
      got.push(t);
    }
  }

  // ---- Tarjeta de fidelización ----
  let loyaltyPatch: Appointment["loyalty"] = appt.loyalty;
  let awarded: Awarded[] = [];
  let redeemedPercent = 0;
  try {
    if (wasDone && next !== "done") {
      await revertLoyalty(appt);
      loyaltyPatch = undefined;
    }
    if (!wasDone && next === "done") {
      const code = str(b.redeemCode, 20).toUpperCase();
      if (code) {
        const r = await redeemFor(code, appt);
        loyaltyPatch = { stamps: 0, rewards: [], redeemed: r.code };
        if (r.percent) {
          // Con un descuento el cliente igual pagó el corte: suma su sello.
          redeemedPercent = r.percent;
          const res = await addStampsFor(appt, (await getConfig()).name);
          if (res.loyalty) loyaltyPatch = { ...res.loyalty, redeemed: r.code };
          awarded = res.awarded;
        }
      } else {
        const res = await addStampsFor(appt, (await getConfig()).name);
        loyaltyPatch = res.loyalty;
        awarded = res.awarded;
      }
    }
  } catch (e) {
    if (wasCancelled && next !== "cancelled") await releaseSlots(appt);
    throw e;
  }

  // ---- Caja ----
  if (next === "cancelled") {
    await releaseSlots(appt);
    await deleteCashEntry(appt.date, cashId);
  } else if (next === "done") {
    const redeemed = Boolean(loyaltyPatch?.redeemed);
    // Premio canjeado: gratis = $0; descuento = precio menos el porcentaje. El dueño puede indicar otro monto.
    const amount =
      money(b.amount) ??
      (redeemed ? (redeemedPercent ? Math.round((appt.price * (100 - redeemedPercent)) / 100) : 0) : appt.price);
    const method = METHODS.includes(b.method as PayMethod) ? (b.method as PayMethod) : "efectivo";
    await saveCashEntry({
      id: cashId,
      date: appt.date,
      type: "ingreso",
      amount,
      method,
      concept: redeemed ? `${appt.serviceName} (premio ${loyaltyPatch!.redeemed})` : appt.serviceName,
      appointmentId: appt.id,
    });
  } else {
    await deleteCashEntry(appt.date, cashId);
  }

  const updated: Appointment = { ...appt, status: next };
  if (loyaltyPatch) updated.loyalty = loyaltyPatch;
  else delete updated.loyalty;
  await db.hset(keys.day(date), id, updated);
  return json({ ok: true, appointment: updated, awarded });
}, { admin: true });
