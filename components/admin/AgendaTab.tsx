"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, formatDateEs } from "@/lib/dates";
import { ars } from "@/lib/format";
import type { Appointment, PayMethod, Service } from "@/lib/types";
import { api, waNumber } from "./api";

type DayData = { date: string; appointments: Appointment[]; free: Record<string, string[]> };

const LABEL: Record<Appointment["status"], string> = {
  reserved: "Reservado",
  done: "Cobrado",
  cancelled: "Cancelado",
  noshow: "No vino",
};

export default function AgendaTab({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DayData | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("efectivo");
  const [amount, setAmount] = useState("");
  const [form, setForm] = useState({ serviceId: "", time: "", name: "", phone: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await api<DayData>(`/api/admin/turnos?date=${date}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [date]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useEffect(() => {
    api<Service[]>("/api/admin/servicios")
      .then((s) => {
        setServices(s.filter((x) => x.active));
        setForm((f) => ({ ...f, serviceId: f.serviceId || s.find((x) => x.active)?.id || "" }));
      })
      .catch(() => {});
  }, []);

  async function setStatus(a: Appointment, status: Appointment["status"], extra: object = {}) {
    setBusy(true);
    try {
      await api("/api/admin/turnos", { method: "PATCH", json: { date: a.date, id: a.id, status, ...extra } });
      setPaying(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/turnos", { method: "POST", json: { ...form, date } });
      setForm((f) => ({ ...f, time: "", name: "", phone: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const list = data?.appointments ?? [];
  const active = list.filter((a) => a.status !== "cancelled");
  const done = list.filter((a) => a.status === "done").length;
  const freeTimes = data?.free[form.serviceId] ?? [];

  return (
    <>
      <h2 className="display">Agenda</h2>
      <p className="sub">
        {formatDateEs(date, true)} · {active.length} turno{active.length === 1 ? "" : "s"} · {done} cobrado
        {done === 1 ? "" : "s"}
      </p>

      <div className="toolbar">
        <button className="btn ghost sm" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">
          ←
        </button>
        <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 170, minHeight: 38 }} />
        <button className="btn ghost sm" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente">
          →
        </button>
        <button className="btn ghost sm" onClick={() => setDate(today)} disabled={date === today}>
          Hoy
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="two">
        <div className="card">
          <h3>Turnos del día</h3>
          {!data ? (
            <p className="empty">Cargando…</p>
          ) : list.length === 0 ? (
            <p className="empty">No hay turnos este día.</p>
          ) : (
            list.map((a) => (
              <div className="appt" key={a.id} style={{ opacity: a.status === "cancelled" ? 0.55 : 1 }}>
                <div className="t">{a.time}</div>
                <div className="who">
                  <b>{a.name}</b> <span className={`pill ${a.status}`}>{LABEL[a.status]}</span>
                  <small>
                    {a.serviceName} · {ars(a.price)}
                    {a.source === "admin" ? " · cargado a mano" : ""}
                  </small>
                  {a.phone && (
                    <small>
                      <a href={`tel:${a.phone}`}>{a.phone}</a> ·{" "}
                      <a href={`https://wa.me/${waNumber(a.phone)}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--red-hi)" }}>
                        WhatsApp
                      </a>
                    </small>
                  )}
                </div>
                <div className="acts">
                  {a.status === "reserved" && (
                    <>
                      <button
                        className="btn sm"
                        onClick={() => {
                          setPaying(a.id);
                          setAmount(String(a.price));
                          setMethod("efectivo");
                        }}
                      >
                        Cobrar
                      </button>
                      <button className="btn ghost sm" disabled={busy} onClick={() => setStatus(a, "noshow")}>
                        No vino
                      </button>
                      <button className="btn danger sm" disabled={busy} onClick={() => confirm("¿Cancelar este turno? Se libera el horario.") && setStatus(a, "cancelled")}>
                        Cancelar
                      </button>
                    </>
                  )}
                  {a.status !== "reserved" && (
                    <button className="btn ghost sm" disabled={busy} onClick={() => setStatus(a, "reserved")}>
                      {a.status === "done" ? "Deshacer cobro" : "Reactivar"}
                    </button>
                  )}
                </div>
                {paying === a.id && (
                  <div className="pay">
                    <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="otro">Otro</option>
                    </select>
                    <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} aria-label="Monto cobrado" />
                    <button className="btn sm" disabled={busy || !amount} onClick={() => setStatus(a, "done", { method, amount: Number(amount) })}>
                      Confirmar cobro
                    </button>
                    <button className="btn ghost sm" onClick={() => setPaying(null)}>
                      Cerrar
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <form className="card" onSubmit={addManual}>
          <h3>Cargar turno a mano</h3>
          <p className="hint" style={{ marginBottom: 16, fontSize: 14 }}>
            Para quien escribe por WhatsApp o llega sin reserva.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <div className="field">
              <label>Servicio</label>
              <select className="input" value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value, time: "" })}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {ars(s.price)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Horario libre</label>
              <select className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required>
                <option value="">{freeTimes.length ? "Elegí un horario" : "Sin horarios libres"}</option>
                {freeTimes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Nombre</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} required />
            </div>
            <div className="field">
              <label>Teléfono (opcional)</label>
              <input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} />
            </div>
            <button className="btn" disabled={busy || !form.time || form.name.trim().length < 2}>
              Agregar turno
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
