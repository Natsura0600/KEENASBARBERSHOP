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
import type { Appointment, AppointmentStatus, PayMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = guard(async (req) => {
  const date = new URL(req.url).searchParams.get("date") ?? nowAR().date;
  if (!isValidDate(date)) return json({ error: "Fecha inválida" }, 400);
  const [config, services, appointments] = await Promise.all([
    getConfig(),
    getServices(),
    appointmentsOf(date),
  ]);
  // Horarios libres por servicio, para cargar turnos a mano.
  const free: Record<string, string[]> = {};
  for (const s of services.filter((x) => x.active)) {
    const av = await availability(config, s, date, true);
    free[s.id] = av.slots.filter((x) => x.free).map((x) => x.time);
  }
  return json({ date, appointments, free });
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

  if (appt.status === "cancelled" && next !== "cancelled") {
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

  if (next === "cancelled") {
    await releaseSlots(appt);
    await deleteCashEntry(appt.date, cashId);
  } else if (next === "done") {
    const amount = money(b.amount) ?? appt.price;
    const method = METHODS.includes(b.method as PayMethod) ? (b.method as PayMethod) : "efectivo";
    await saveCashEntry({
      id: cashId,
      date: appt.date,
      type: "ingreso",
      amount,
      method,
      concept: appt.serviceName,
      appointmentId: appt.id,
    });
  } else {
    await deleteCashEntry(appt.date, cashId);
  }

  const updated: Appointment = { ...appt, status: next };
  await db.hset(keys.day(date), id, updated);
  return json({ ok: true, appointment: updated });
}, { admin: true });
