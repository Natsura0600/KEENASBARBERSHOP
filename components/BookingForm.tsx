"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DAYS_SHORT, MONTHS_ES, addDays, dow, formatDateEs, listDays } from "@/lib/dates";
import { ars } from "@/lib/format";
import type { DayHours, Service } from "@/lib/types";

type Props = {
  services: Service[];
  hours: Record<string, DayHours>;
  maxDaysAhead: number;
  today: string;
  initialServiceId?: string;
  shop: { name: string; address: string; whatsapp: string; conditions: string };
};

type Slot = { time: string; free: boolean };
type Done = { date: string; time: string; serviceName: string; price: number; name: string };

function icsFor(done: Done, durationMin: number, shop: Props["shop"]) {
  const [y, m, d] = done.date.split("-").map(Number);
  const [hh, mm] = done.time.split(":").map(Number);
  // Argentina es UTC-3 todo el año
  const start = new Date(Date.UTC(y, m - 1, d, hh + 3, mm));
  const end = new Date(start.getTime() + durationMin * 60000);
  const f = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const text = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Turnos//ES",
    "BEGIN:VEVENT",
    `UID:${f(start)}-${done.name.length}@turnos`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`,
    `DTEND:${f(end)}`,
    `SUMMARY:${done.serviceName} · ${shop.name}`,
    `LOCATION:${shop.address}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(text)}`;
}

export default function BookingForm({ services, hours, maxDaysAhead, today, initialServiceId, shop }: Props) {
  const [serviceId, setServiceId] = useState<string | undefined>(initialServiceId);
  const [date, setDate] = useState<string | undefined>();
  const [time, setTime] = useState<string | undefined>();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const reqId = useRef(0);

  const service = services.find((s) => s.id === serviceId);
  const days = useMemo(() => listDays(today, addDays(today, maxDaysAhead)), [today, maxDaysAhead]);

  const dayOpen = (d: string) => {
    if (!hours[String(dow(d))]) return false;
    if (service?.onlyDays?.length && !service.onlyDays.includes(dow(d))) return false;
    return true;
  };

  // Si cambia el servicio y el día elegido ya no sirve, se limpia.
  useEffect(() => {
    if (date && !dayOpen(date)) {
      setDate(undefined);
      setTime(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  useEffect(() => {
    setTime(undefined);
    setSlots(null);
    if (!serviceId || !date) return;
    const id = ++reqId.current;
    setLoadingSlots(true);
    fetch(`/api/availability?date=${date}&serviceId=${serviceId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (id === reqId.current) setSlots(data.slots ?? []);
      })
      .catch(() => id === reqId.current && setSlots([]))
      .finally(() => id === reqId.current && setLoadingSlots(false));
  }, [serviceId, date]);

  const ready = Boolean(service && date && time && name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 8);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, date, time, name, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos reservar. Probá de nuevo.");
        if (res.status === 409) {
          // refrescar horarios
          const id = ++reqId.current;
          fetch(`/api/availability?date=${date}&serviceId=${serviceId}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => id === reqId.current && setSlots(d.slots ?? []));
          setTime(undefined);
        }
        return;
      }
      setDone(data.appointment);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Sin conexión. Revisá tu internet y probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  /* ---------------- confirmación ---------------- */
  if (done) {
    const svc = services.find((s) => s.name === done.serviceName);
    const wa = `https://wa.me/${shop.whatsapp}?text=${encodeURIComponent(
      `Hola! Soy ${done.name}. Reservé ${done.serviceName} el ${formatDateEs(done.date)} a las ${done.time}.`,
    )}`;
    return (
      <div style={{ paddingTop: 56 }}>
        <div className="ticket">
          <span className="eyebrow">Turno confirmado</span>
          <h1 className="display">Te esperamos, {done.name.split(" ")[0]}</h1>
          <div className="when">
            <div>
              <small className="tag">Cuándo</small>
              <div style={{ marginTop: 8 }}>
                <b>{formatDateEs(done.date)}</b>
                <br />
                <b style={{ color: "var(--red-hi)" }}>{done.time} hs</b>
              </div>
            </div>
            <div>
              <small className="tag">Qué</small>
              <div style={{ marginTop: 8, fontWeight: 600 }}>
                {done.serviceName} · {ars(done.price)}
              </div>
            </div>
            <div>
              <small className="tag">Dónde</small>
              <div style={{ marginTop: 8, fontWeight: 600 }}>{shop.address}</div>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 22 }}>
            {shop.conditions}
          </p>
          <div className="actions">
            <a className="btn" href={icsFor(done, svc?.duration ?? 40, shop)} download="turno.ics">
              Sumar al calendario
            </a>
            {shop.whatsapp && (
              <a className="btn ghost" href={wa} target="_blank" rel="noopener noreferrer">
                Avisar por WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- formulario ---------------- */
  return (
    <form onSubmit={submit} noValidate>
      <div className="page-head">
        <span className="eyebrow">Turnos online</span>
        <h1 className="display">Reservá tu turno</h1>
        <p>Elegí servicio, día y horario. Los horarios que ves son los que están libres en este momento.</p>
      </div>

      <div className="book">
        <div>
          <div className="stepbox">
            <h2>
              <i>01</i> Servicio
            </h2>
            <div className="opt-list">
              {services.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="opt"
                  aria-pressed={serviceId === s.id}
                  onClick={() => setServiceId(s.id)}
                >
                  <b>{s.name}</b>
                  <span className="p">{ars(s.price)}</span>
                  <small>
                    {s.detail} · {s.duration} min
                    {s.onlyDays?.length ? ` · solo ${s.onlyDays.map((d) => DAYS_SHORT[d]).join(", ")}` : ""}
                  </small>
                </button>
              ))}
            </div>
          </div>

          <div className="stepbox">
            <h2>
              <i>02</i> Día
            </h2>
            {!service ? (
              <p className="hint">Primero elegí el servicio.</p>
            ) : (
              <div className="days" role="group" aria-label="Días disponibles">
                {days.map((d) => {
                  const open = dayOpen(d);
                  const [, m, n] = d.split("-").map(Number);
                  return (
                    <button
                      type="button"
                      key={d}
                      className="day"
                      disabled={!open}
                      aria-pressed={date === d}
                      onClick={() => setDate(d)}
                      aria-label={formatDateEs(d)}
                    >
                      <small>{d === today ? "Hoy" : DAYS_SHORT[dow(d)]}</small>
                      <b>{n}</b>
                      <span>{MONTHS_ES[m - 1].slice(0, 3)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="stepbox">
            <h2>
              <i>03</i> Horario
            </h2>
            {!date ? (
              <p className="hint">Elegí un día para ver los horarios.</p>
            ) : loadingSlots ? (
              <div className="slots" aria-busy>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div className="skeleton" key={i} />
                ))}
              </div>
            ) : slots && slots.some((s) => s.free) ? (
              <div className="slots" role="group" aria-label="Horarios">
                {slots.map((s) => (
                  <button
                    type="button"
                    key={s.time}
                    className="slot"
                    disabled={!s.free}
                    aria-pressed={time === s.time}
                    onClick={() => setTime(s.time)}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            ) : (
              <p className="hint">No quedan horarios ese día. Probá con otro.</p>
            )}
          </div>

          <div className="stepbox">
            <h2>
              <i>04</i> Tus datos
            </h2>
            <div className="form-2">
              <div className="field">
                <label htmlFor="name">Nombre</label>
                <input
                  id="name"
                  className="input"
                  autoComplete="name"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Cómo te llamás"
                />
              </div>
              <div className="field">
                <label htmlFor="phone">Teléfono / WhatsApp</label>
                <input
                  id="phone"
                  className="input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="11 5555 5555"
                />
              </div>
            </div>
          </div>
        </div>

        <aside className="summary" aria-live="polite">
          <h3>Tu turno</h3>
          <dl>
            <div>
              <dt>Servicio</dt>
              <dd className={service ? "" : "unset"}>{service ? service.name : "Sin elegir"}</dd>
            </div>
            <div>
              <dt>Día</dt>
              <dd className={date ? "" : "unset"}>{date ? formatDateEs(date) : "Sin elegir"}</dd>
            </div>
            <div>
              <dt>Horario</dt>
              <dd className={time ? "" : "unset"}>{time ? `${time} hs` : "Sin elegir"}</dd>
            </div>
          </dl>
          <div className="total">
            <span>Total</span>
            <b>{service ? ars(service.price) : "—"}</b>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn" style={{ width: "100%" }} type="submit" disabled={!ready || sending}>
            {sending ? "Reservando…" : "Confirmar turno"}
          </button>
          <p className="hint" style={{ marginTop: 14, fontSize: 13.5 }}>
            {shop.conditions}
          </p>
        </aside>
      </div>
    </form>
  );
}
