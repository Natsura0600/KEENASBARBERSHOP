"use client";

import { useCallback, useEffect, useState } from "react";
import { DAYS_SHORT, MONTHS_ES, dow, formatDateEs } from "@/lib/dates";
import { ars } from "@/lib/format";
import type { CashSummary } from "@/lib/data";
import { api } from "./api";

function rangeLabel(s: CashSummary) {
  const [y, m, d1] = s.start.split("-").map(Number);
  if (s.mode === "month") return `${MONTHS_ES[m - 1][0].toUpperCase()}${MONTHS_ES[m - 1].slice(1)} ${y}`;
  const [, m2, d2] = s.end.split("-").map(Number);
  return `${d1} ${MONTHS_ES[m - 1].slice(0, 3)} – ${d2} ${MONTHS_ES[m2 - 1].slice(0, 3)}`;
}

export default function CajaTab({ today }: { today: string }) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const [ref, setRef] = useState(today);
  const [sum, setSum] = useState<CashSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ type: "egreso", date: today, concept: "", amount: "", method: "efectivo" });

  const load = useCallback(async () => {
    try {
      setError("");
      setSum(await api<CashSummary>(`/api/admin/caja?mode=${mode}&ref=${ref}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [mode, ref]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/caja", { method: "POST", json: { ...f, amount: Number(f.amount) } });
      setF({ ...f, concept: "", amount: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(date: string, id: string) {
    if (!confirm("¿Borrar este movimiento?")) return;
    try {
      await api(`/api/admin/caja?date=${date}&id=${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  const max = sum ? Math.max(1, ...sum.days.map((d) => Math.max(d.ingresos, d.egresos))) : 1;

  return (
    <>
      <h2 className="display">Caja</h2>
      <p className="sub">Cada turno que cobrás en Agenda entra solo acá. Los gastos y otros ingresos los cargás abajo.</p>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Período">
          <button aria-pressed={mode === "week"} onClick={() => setMode("week")}>
            Semana
          </button>
          <button aria-pressed={mode === "month"} onClick={() => setMode("month")}>
            Mes
          </button>
        </div>
        <button className="btn ghost sm" onClick={() => sum && setRef(sum.prevRef)} aria-label="Anterior">
          ←
        </button>
        <span className="range-label">{sum ? rangeLabel(sum) : "…"}</span>
        <button className="btn ghost sm" onClick={() => sum && setRef(sum.nextRef)} aria-label="Siguiente">
          →
        </button>
        <button className="btn ghost sm" onClick={() => setRef(today)}>
          Hoy
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {sum && (
        <>
          <div className="kpis">
            <div className="kpi">
              <small>Ingresos</small>
              <b>{ars(sum.totals.ingresos)}</b>
              <em>
                {sum.totals.cortes} servicio{sum.totals.cortes === 1 ? "" : "s"}
                {sum.totals.cortes ? ` · ${ars(sum.totals.ticket)} c/u` : ""}
              </em>
            </div>
            <div className="kpi">
              <small>Egresos</small>
              <b>{ars(sum.totals.egresos)}</b>
              <em>Gastos del período</em>
            </div>
            <div className={`kpi net ${sum.totals.neto < 0 ? "neg" : ""}`}>
              <small>Resultado</small>
              <b>{ars(sum.totals.neto)}</b>
              <em>Ingresos − egresos</em>
            </div>
            <div className="kpi">
              <small>Cobrado en</small>
              <b style={{ fontSize: 22, lineHeight: 1.25 }}>
                Efectivo {ars(sum.totals.byMethod.efectivo)}
                <br />
                Transf. {ars(sum.totals.byMethod.transferencia)}
              </b>
              {sum.totals.byMethod.otro > 0 && <em>Otros {ars(sum.totals.byMethod.otro)}</em>}
            </div>
          </div>

          <div className="two">
            <div className="card">
              <h3>Por día</h3>
              <div className="bars" aria-label="Ingresos y egresos por día">
                {sum.days.map((d) => (
                  <div className="bar" key={d.date} title={`${formatDateEs(d.date)}\nIngresos ${ars(d.ingresos)}\nEgresos ${ars(d.egresos)}`}>
                    <i style={{ height: `${(d.ingresos / max) * 100}%` }} />
                    <i className="eg" style={{ height: `${(d.egresos / max) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="bar-x">
                {sum.days.map((d) => {
                  const n = Number(d.date.slice(8));
                  const show = sum.mode === "week" || n === 1 || n % 5 === 0;
                  return (
                    <span key={d.date}>
                      {show ? (sum.mode === "week" ? `${DAYS_SHORT[dow(d.date)]} ${n}` : n) : ""}
                    </span>
                  );
                })}
              </div>
              <p className="hint" style={{ marginTop: 14, fontSize: 13 }}>
                <span style={{ color: "var(--red-hi)" }}>■</span> Ingresos &nbsp; <span style={{ color: "#4a423e" }}>■</span> Egresos
              </p>
            </div>

            <div className="card">
              <h3>Qué se vendió</h3>
              {sum.byConcept.length === 0 ? (
                <p className="empty">Todavía no hay ingresos.</p>
              ) : (
                <div className="rows">
                  {sum.byConcept.map((c) => (
                    <div className="row" key={c.concept}>
                      <div>
                        <b>{c.concept}</b>
                        <br />
                        <small>
                          {c.count} vez{c.count === 1 ? "" : "es"}
                        </small>
                      </div>
                      <b>{ars(c.total)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="two" style={{ marginTop: 0 }}>
            <div className="card">
              <h3>Movimientos</h3>
              {sum.entries.length === 0 ? (
                <p className="empty">Sin movimientos en este período.</p>
              ) : (
                <div className="rows">
                  {[...sum.entries].reverse().map((e) => (
                    <div className="row" key={e.id}>
                      <div>
                        <b>{e.concept}</b>
                        <br />
                        <small>
                          {formatDateEs(e.date)} · {e.method}
                          {e.appointmentId ? " · turno" : ""}
                        </small>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <b className={e.type === "ingreso" ? "pos" : "neg"}>
                          {e.type === "ingreso" ? "+" : "−"}
                          {ars(e.amount)}
                        </b>
                        <button className="btn ghost sm" onClick={() => remove(e.date, e.id)} aria-label="Borrar movimiento">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form className="card" onSubmit={add}>
              <h3>Cargar movimiento</h3>
              <div style={{ display: "grid", gap: 12 }}>
                <div className="seg" role="group" aria-label="Tipo">
                  <button type="button" aria-pressed={f.type === "egreso"} onClick={() => setF({ ...f, type: "egreso" })}>
                    Gasto
                  </button>
                  <button type="button" aria-pressed={f.type === "ingreso"} onClick={() => setF({ ...f, type: "ingreso" })}>
                    Ingreso
                  </button>
                </div>
                <div className="field">
                  <label>Concepto</label>
                  <input className="input" value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} placeholder={f.type === "egreso" ? "Insumos, alquiler, luz…" : "Venta de producto…"} maxLength={80} required />
                </div>
                <div className="form-2">
                  <div className="field">
                    <label>Monto</label>
                    <input className="input" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} required />
                  </div>
                  <div className="field">
                    <label>Fecha</label>
                    <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
                  </div>
                </div>
                <div className="field">
                  <label>Medio</label>
                  <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <button className="btn" disabled={busy || !f.amount || !f.concept}>
                  Guardar movimiento
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
