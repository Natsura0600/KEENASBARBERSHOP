"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Status = { configured: boolean; publicKey: string; devices: number };
type Env = "loading" | "unsupported" | "ios-browser" | "ready" | "denied";

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function AppTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [env, setEnv] = useState<Env>("loading");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const detect = useCallback(async () => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (ios && !standalone) return setEnv("ios-browser");
    if (!supported) return setEnv("unsupported");
    if (Notification.permission === "denied") setEnv("denied");
    else setEnv("ready");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      setActive(Boolean(await reg?.pushManager.getSubscription()) && Notification.permission === "granted");
    } catch {}
  }, []);

  useEffect(() => {
    api<Status>("/api/admin/push").then(setStatus).catch((e) => setMsg({ ok: false, text: e.message }));
    detect();
  }, [detect]);

  async function enable() {
    if (!status?.publicKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setEnv("denied");
        throw new Error("No diste permiso para las notificaciones.");
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.publicKey) });
      }
      const res = await api<{ devices: number }>("/api/admin/push", { method: "POST", json: { subscription: sub.toJSON() } });
      setStatus({ ...status, devices: res.devices });
      setActive(true);
      setMsg({ ok: true, text: "Listo. Probá con el botón “Enviar aviso de prueba”." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo activar." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/api/admin/push", { method: "DELETE", json: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setActive(false);
      setMsg({ ok: true, text: "Avisos desactivados en este celular." });
      setStatus(await api<Status>("/api/admin/push"));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/push", { method: "PUT" });
      setMsg({ ok: true, text: "Enviado. Te tiene que llegar en unos segundos." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="display">App y avisos</h2>
      <p className="sub">Instalá el panel en el celular como una app y recibí una notificación cada vez que alguien reserva.</p>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>1 · Instalar en el iPhone</h3>
        <ol className="how">
          <li>Abrí esta misma página (<b>/admin</b>) con <b>Safari</b>.</li>
          <li>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
          <li>Elegí <b>Agregar a inicio</b> y confirmá.</li>
          <li>Abrí la app desde el ícono nuevo de tu pantalla de inicio e ingresá con tu contraseña.</li>
        </ol>
        <p className="hint" style={{ fontSize: 13.5 }}>
          En Android: menú de Chrome → <b>Instalar app</b>. En iPhone hace falta iOS 16.4 o más nuevo, y las notificaciones solo funcionan con la app abierta desde el ícono, no desde Safari.
        </p>
      </div>

      <div className="card">
        <h3>2 · Activar los avisos</h3>

        {status && !status.configured && (
          <p className="error" role="alert">
            Todavía no están cargadas las claves de notificaciones en el servidor (VAPID). Quien armó la web las configura en Vercel; los pasos están en el README.
          </p>
        )}
        {env === "ios-browser" && (
          <p className="error" role="alert">
            Estás en Safari. Primero instalá la app (paso 1) y abrí esta pantalla desde el ícono: ahí aparece el botón para activar.
          </p>
        )}
        {env === "unsupported" && <p className="error">Este navegador no soporta notificaciones. Probá con Chrome o Safari actualizados.</p>}
        {env === "denied" && (
          <p className="error">
            Las notificaciones están bloqueadas. Activalas en Ajustes del celular → Notificaciones → esta app, y volvé a intentar.
          </p>
        )}

        <p className="hint" style={{ marginBottom: 14 }}>
          Celulares con avisos activos: <b>{status ? status.devices : "…"}</b>
          {env === "ready" && <> · Este celular: <b>{active ? "activado" : "sin activar"}</b></>}
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!active ? (
            <button className="btn" onClick={enable} disabled={busy || env !== "ready" || !status?.configured}>
              Activar avisos en este celular
            </button>
          ) : (
            <button className="btn ghost" onClick={disable} disabled={busy}>
              Desactivar en este celular
            </button>
          )}
          <button className="btn ghost" onClick={test} disabled={busy || !status?.configured || !status.devices}>
            Enviar aviso de prueba
          </button>
        </div>
        {msg && (
          <p className={msg.ok ? "pos" : "neg"} style={{ marginTop: 14 }} role="status">
            {msg.text}
          </p>
        )}
      </div>
    </>
  );
}
