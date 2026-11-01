"use client";

import { useEffect, useState } from "react";
import { DAYS_ES } from "@/lib/dates";
import { ORDER } from "@/lib/format";
import type { Config } from "@/lib/types";
import { api } from "./api";

export default function LocalTab() {
  const [c, setC] = useState<Config | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Config>("/api/admin/config")
      .then(setC)
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);

  if (!c) return <p className="empty">{msg ? msg.text : "Cargando…"}</p>;

  const set = <K extends keyof Config>(k: K, v: Config[K]) => {
    setMsg(null);
    setC((prev) => (prev ? { ...prev, [k]: v } : prev));
  };
  const setHour = (d: number, part: "open" | "close", v: string) => {
    const cur = c.hours[String(d)] ?? { open: "10:00", close: "20:00" };
    set("hours", { ...c.hours, [String(d)]: { ...cur, [part]: v } });
  };

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ config: Config }>("/api/admin/config", { method: "PUT", json: c });
      setC(res.config);
      setMsg({ ok: true, text: "Guardado. La web ya usa estos datos." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  const text = (label: string, k: keyof Config, max = 100, hint?: string) => (
    <div className="field">
      <label>{label}</label>
      <input className="input" maxLength={max} value={String(c[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} />
      {hint && <small className="hint" style={{ fontSize: 12.5 }}>{hint}</small>}
    </div>
  );

  return (
    <>
      <h2 className="display">Local</h2>
      <p className="sub">Datos del negocio, ubicación y horarios de atención. Los horarios definen los turnos que se pueden reservar.</p>

      <div className="two">
        <div className="card">
          <h3>Datos del negocio</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {text("Nombre", "name", 60)}
            {text("Frase de portada", "tagline", 140)}
            {text("Barbero", "barber", 60)}
            <div className="field">
              <label>Sobre el barbero</label>
              <textarea className="input" maxLength={600} value={c.about} onChange={(e) => set("about", e.target.value)} />
            </div>
            {text("WhatsApp", "whatsapp", 20, "Con código de país, sin + ni espacios. Ej: 5491151353287")}
            {text("Instagram (opcional)", "instagram", 40)}
          </div>
        </div>

        <div className="card">
          <h3>Ubicación</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {text("Dirección", "address", 100)}
            {text("Ciudad", "city", 80)}
            <p className="hint" style={{ fontSize: 13.5 }}>
              El mapa de la web se arma con la dirección y la ciudad.
            </p>
          </div>
          <h3 style={{ marginTop: 26 }}>Turnos</h3>
          <div className="form-2">
            <div className="field">
              <label>Minutos por turno</label>
              <input className="input" inputMode="numeric" value={c.slotMinutes} onChange={(e) => set("slotMinutes", Number(e.target.value.replace(/\D/g, "")))} />
            </div>
            <div className="field">
              <label>Reservar hasta (días)</label>
              <input className="input" inputMode="numeric" value={c.maxDaysAhead} onChange={(e) => set("maxDaysAhead", Number(e.target.value.replace(/\D/g, "")))} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Condiciones de reserva</label>
            <textarea className="input" maxLength={500} value={c.conditions} onChange={(e) => set("conditions", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Horarios de atención</h3>
        <div className="hrs">
          {ORDER.map((d) => {
            const h = c.hours[String(d)];
            return (
              <div className="hr" key={d}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!h}
                    onChange={(e) => set("hours", { ...c.hours, [String(d)]: e.target.checked ? { open: "10:00", close: "20:00" } : null })}
                  />
                  {DAYS_ES[d]}
                </label>
                {h ? (
                  <div className="times">
                    <input className="input" type="time" value={h.open} onChange={(e) => setHour(d, "open", e.target.value)} aria-label={`${DAYS_ES[d]} abre`} />
                    <span>a</span>
                    <input className="input" type="time" value={h.close} onChange={(e) => setHour(d, "close", e.target.value)} aria-label={`${DAYS_ES[d]} cierra`} />
                  </div>
                ) : (
                  <span className="hint">Cerrado</span>
                )}
                <span />
              </div>
            );
          })}
        </div>
      </div>

      <div className="savebar">
        <span className={msg ? (msg.ok ? "pos" : "neg") : "hint"}>{msg?.text ?? "Si cambiás horarios, los turnos ya reservados no se mueven."}</span>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </>
  );
}
