"use client";

import { useState } from "react";
import { api } from "./api";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/login", { method: "POST", json: { password } });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={submit}>
        <span className="eyebrow">Acceso privado</span>
        <h1 className="display">Panel</h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="field" style={{ marginBottom: 18 }}>
          <label htmlFor="pw">Contraseña</label>
          <input
            id="pw"
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn" style={{ width: "100%" }} disabled={busy || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
