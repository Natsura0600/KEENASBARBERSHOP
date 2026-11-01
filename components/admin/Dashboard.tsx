"use client";

import Link from "next/link";
import { useState } from "react";
import AgendaTab from "./AgendaTab";
import AvisosTab from "./AvisosTab";
import CajaTab from "./CajaTab";
import LocalTab from "./LocalTab";
import ServiciosTab from "./ServiciosTab";
import { api } from "./api";

const TABS = [
  ["agenda", "Agenda"],
  ["caja", "Caja"],
  ["servicios", "Servicios"],
  ["avisos", "Avisos"],
  ["local", "Local"],
] as const;

type Tab = (typeof TABS)[number][0];

export default function Dashboard({ today, shopName }: { today: string; shopName: string }) {
  const [tab, setTab] = useState<Tab>("agenda");

  async function logout() {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    window.location.reload();
  }

  return (
    <div className="adm">
      <div className="adm-top">
        <div className="pole" aria-hidden />
        <div className="wrap adm-bar">
          <div className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn ghost sm" href="/" target="_blank">
              Ver web
            </Link>
            <button className="btn ghost sm" onClick={logout}>
              Salir
            </button>
          </div>
        </div>
      </div>

      <main className="wrap adm-main">
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          {shopName}
        </p>
        {tab === "agenda" && <AgendaTab today={today} />}
        {tab === "caja" && <CajaTab today={today} />}
        {tab === "servicios" && <ServiciosTab />}
        {tab === "avisos" && <AvisosTab />}
        {tab === "local" && <LocalTab />}
      </main>
    </div>
  );
}
