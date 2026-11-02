"use client";

import { useEffect, useState } from "react";
import { DAYS_SHORT } from "@/lib/dates";
import type { Service } from "@/lib/types";
import { api } from "./api";

export default function ServiciosTab() {
  const [list, setList] = useState<Service[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Service[]>("/api/admin/servicios")
      .then(setList)
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);

  const patch = (i: number, p: Partial<Service>) => {
    setMsg(null);
    setList((l) => l && l.map((s, j) => (j === i ? { ...s, ...p } : s)));
  };

  async function save() {
    if (!list) return;
    setBusy(true);
    try {
      const res = await api<{ services: Service[] }>("/api/admin/servicios", { method: "PUT", json: { services: list } });
      setList(res.services);
      setMsg({ ok: true, text: "Guardado. En la web se ve en unos segundos." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  if (!list) return <p className="empty">{msg ? msg.text : "Cargando…"}</p>;

  return (
    <>
      <h2 className="display">Servicios</h2>
      <p className="sub">Nombre, precio y duración de cada servicio. Si lo desactivás, deja de aparecer para reservar.</p>

      <div className="card">
        {list.map((s, i) => (
          <div className="svc" key={s.id + i} style={{ opacity: s.active ? 1 : 0.6 }}>
            <div className="field">
              <label>Nombre</label>
              <input className="input" value={s.name} maxLength={60} onChange={(e) => patch(i, { name: e.target.value })} />
            </div>
            <div className="field">
              <label>Descripción corta</label>
              <input className="input" value={s.detail} maxLength={140} onChange={(e) => patch(i, { detail: e.target.value })} />
            </div>
            <div className="field">
              <label>Precio ($)</label>
              <input className="input" inputMode="numeric" value={s.price} onChange={(e) => patch(i, { price: Number(e.target.value.replace(/\D/g, "")) })} />
            </div>
            <div className="field">
              <label>Minutos</label>
              <input className="input" inputMode="numeric" value={s.duration} onChange={(e) => patch(i, { duration: Number(e.target.value.replace(/\D/g, "")) })} />
            </div>
            <div className="full">
              <label className="check">
                <input type="checkbox" checked={s.active} onChange={(e) => patch(i, { active: e.target.checked })} />
                Visible y reservable
              </label>
              <span className="hint" style={{ fontSize: 13 }}>
                Solo estos días:
              </span>
              {DAYS_SHORT.map((d, n) => (
                <label className="check" key={d}>
                  <input
                    type="checkbox"
                    checked={s.onlyDays?.includes(n) ?? false}
                    onChange={(e) => {
                      const cur = new Set(s.onlyDays ?? []);
                      e.target.checked ? cur.add(n) : cur.delete(n);
                      patch(i, { onlyDays: [...cur].sort() });
                    }}
                  />
                  {d}
                </label>
              ))}
              <button className="btn danger sm" style={{ marginLeft: "auto" }} onClick={() => confirm(`¿Borrar "${s.name}"?`) && setList(list.filter((_, j) => j !== i))}>
                Borrar
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn ghost sm"
          style={{ marginTop: 14 }}
          onClick={() => setList([...list, { id: "", name: "", detail: "", price: 0, duration: 40, active: true }])}
        >
          + Agregar servicio
        </button>
      </div>

      <div className="savebar">
        <span className={msg ? (msg.ok ? "pos" : "neg") : "hint"}>{msg?.text ?? "Los cambios se aplican cuando guardás."}</span>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </>
  );
}
