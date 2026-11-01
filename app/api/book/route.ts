import {
  BookingError,
  availability,
  createAppointment,
  getConfig,
  getServices,
} from "@/lib/data";
import { addDays, isValidDate, isValidTime, nowAR } from "@/lib/dates";
import { allow, body, guard, json, str } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = guard(async (req) => {
  if (!(await allow("book", req, 8, 60 * 60))) {
    return json({ error: "Demasiados intentos. Probá de nuevo en un rato o escribinos por WhatsApp." }, 429);
  }

  const b = await body(req);
  const name = str(b.name, 60);
  const phone = str(b.phone, 30).replace(/[^\d+]/g, "");
  const digits = phone.replace(/\D/g, "");
  const { date, time, serviceId } = b;

  if (name.length < 2) return json({ error: "Poné tu nombre." }, 400);
  if (digits.length < 8 || digits.length > 15) return json({ error: "Revisá el teléfono." }, 400);
  if (!isValidDate(date) || !isValidTime(time)) return json({ error: "Fecha u hora inválida." }, 400);

  const [config, services] = await Promise.all([getConfig(), getServices()]);
  const service = services.find((s) => s.id === serviceId && s.active);
  if (!service) return json({ error: "Servicio inválido." }, 400);

  const today = nowAR().date;
  if (date < today || date > addDays(today, config.maxDaysAhead)) {
    return json({ error: "Esa fecha no está disponible para reservar." }, 400);
  }

  const av = await availability(config, service, date);
  if (!av.slots.find((s) => s.time === time && s.free)) {
    throw new BookingError("Ese horario ya no está disponible. Elegí otro.");
  }

  const appt = await createAppointment({ config, service, date, time, name, phone, source: "web" });
  return json({
    ok: true,
    appointment: {
      id: appt.id,
      date: appt.date,
      time: appt.time,
      serviceName: appt.serviceName,
      price: appt.price,
      name: appt.name,
    },
  });
});
