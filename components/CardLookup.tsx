"use client";

import { useState } from "react";
import LoyaltyCard from "./LoyaltyCard";

import type { Milestone } from "@/lib/types";

type Res = { enabled: boolean; found?: boolean; required?: number; rewardName?: string; milestones?: Milestone[]; stamps?: number; rewards?: number; rewardNames?: string[]; expiresOn?: string };

export default function CardLookup() {
  const [phone, setPhone] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setRes(null);
    try {
      const r = await fetch("/api/tarjeta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? "No pudimos consultar. Probá de nuevo.");
      else setRes(d);
    } catch {
      setError("Sin conexión. Revisá tu internet y probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lookup">
      <form onSubmit={submit} className="lookup-form">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="lk-phone">Tu teléfono</label>
          <input id="lk-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2323 45 6789" required />
        </div>
        <button className="btn" disabled={busy || phone.replace(/\D/g, "").length < 8}>
          {busy ? "Buscando…" : "Ver mi tarjeta"}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {res && !res.enabled && <p className="hint">La tarjeta de fidelización no está activa por ahora.</p>}
      {res?.enabled && res.found === false && (
        <p className="hint">
          No encontramos una tarjeta con ese número. Se crea sola la primera vez que reservás con tu teléfono, y suma un sello por cada corte.
        </p>
      )}
      {res?.enabled && res.found && (
        <LoyaltyCard
          stamps={res.stamps ?? 0}
          required={res.required ?? 10}
          rewardName={res.rewardName ?? ""}
          milestones={res.milestones}
          pendingNames={res.rewardNames}
          note={res.expiresOn ? `Tu premio vence el ${res.expiresOn.split("-").reverse().join("/")}.` : undefined}
        />
      )}
    </div>
  );
}
