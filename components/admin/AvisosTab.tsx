"use client";

import { useEffect, useState } from "react";
import type { Notice } from "@/lib/types";
import { api } from "./api";

export default function AvisosTab() {
  const [list, setList] = useState<Notice[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Notice[]>("/api/admin/avisos")
      .then(setList)
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);

  const patch = (i: number, p: Partial<Notice>) => {
    setMsg(null);
    setList((l) => l && l.map((n, j) => (j === i ? { ...n, ...p } : n)));
  };

  async function save() {
    if (!list) return;
    setBusy(true);
    try {
      const res = await api<{ notices: Notice[] }>("/api/admin/avisos", { method: "PUT", json: { notices: list } });
      setList(res.notices);
      setMsg({ ok: true, text: "Guardado. Los avisos activos se ven en la web en unos segundos." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  if (!list) return <p className="empty">{msg ? msg.text : "Cargando…"}</p>;

  return (
    <>
      <h2 className="display">Avisos</h2>
      <p className="sub">Mensajes que aparecen arriba de la web: feriados, cambios de horario, promos. Podés ponerles fecha de vencimiento.</p>

      <div className="card">
        {list.length === 0 && <p className="empty">No hay avisos. Agregá el primero.</p>}
        {list.map((n, i) => (
          <div className="svc" key={n.id + i} style={{ gridTemplateColumns: "1fr 2fr", opacity: n.active ? 1 : 0.6 }}>
            <div className="field">
              <label>Título (opcional)</label>
              <input className="input" value={n.title} maxLength={60} onChange={(e) => patch(i, { title: e.target.value })} />
            </div>
            <div className="field">
              <label>Mensaje</label>
              <input className="input" value={n.text} maxLength={300} onChange={(e) => patch(i, { text: e.target.value })} />
            </div>
            <div className="full">
              <label className="check">
                <input type="checkbox" checked={n.active} onChange={(e) => patch(i, { active: e.target.checked })} />
                Mostrar en la web
              </label>
              <select className="input" style={{ width: 150, minHeight: 38 }} value={n.kind} onChange={(e) => patch(i, { kind: e.target.value as Notice["kind"] })}>
                <option value="info">Aviso normal</option>
                <option value="importante">Importante (rojo)</option>
              </select>
              <label className="check">
                Se oculta el
                <input className="input" type="date" style={{ width: 160, minHeight: 38 }} value={n.expiresOn ?? ""} onChange={(e) => patch(i, { expiresOn: e.target.value || undefined })} />
              </label>
              <button className="btn danger sm" style={{ marginLeft: "auto" }} onClick={() => setList(list.filter((_, j) => j !== i))}>
                Borrar
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn ghost sm"
          style={{ marginTop: 14 }}
          onClick={() => setList([...list, { id: "", title: "", text: "", kind: "info", active: true }])}
        >
          + Agregar aviso
        </button>
      </div>

      <div className="savebar">
        <span className={msg ? (msg.ok ? "pos" : "neg") : "hint"}>{msg?.text ?? "Los avisos sin mensaje no se guardan."}</span>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </>
  );
}
