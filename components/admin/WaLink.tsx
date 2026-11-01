"use client";

import QRCode from "qrcode";
import { useRef, useState } from "react";
import { prettyPhone } from "@/lib/phone";
import { api } from "./api";

export type WaState = { linked: boolean; number?: string; linkedAt?: string; lastOkAt?: string; lastError?: string };

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) : "";

export default function WaLink({ state, onChange }: { state: WaState; onChange: () => void }) {
  const [mode, setMode] = useState<"idle" | "qr" | "code">("idle");
  const [phone, setPhone] = useState("");
  const [qrImg, setQrImg] = useState("");
  const [code, setCode] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function start(kind: "qr" | "code") {
    if (kind === "code" && phone.replace(/\D/g, "").length < 8) return setMsg({ ok: false, text: "Poné el número del WhatsApp que vas a vincular." });
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setMode(kind);
    setQrImg("");
    setCode("");
    setMsg(null);
    setWaiting(true);
    try {
      const res = await fetch(`/api/admin/wa/vincular${kind === "code" ? `?phone=${encodeURIComponent(phone)}` : ""}`, { signal: ac.signal, cache: "no-store" });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo iniciar la vinculación.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /event: (\w+)/.exec(chunk)?.[1];
          const data = JSON.parse(/data: (.*)/.exec(chunk)?.[1] ?? "{}");
          if (ev === "qr") setQrImg(await QRCode.toDataURL(data.qr, { margin: 1, width: 280 }));
          else if (ev === "code") setCode(String(data.code).replace(/^(.{4})(.{4})$/, "$1-$2"));
          else if (ev === "done") {
            setMsg({ ok: true, text: "¡Número vinculado!" });
            setMode("idle");
            onChange();
          } else if (ev === "fail") {
            setMsg({ ok: false, text: data.error });
            setMode("idle");
          }
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setWaiting(false);
      onChange();
    }
  }

  function cancel() {
    abort.current?.abort();
    setMode("idle");
    setWaiting(false);
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/wa", { method: "POST", json: { phone: test } });
      setMsg({ ok: true, text: "Mensaje enviado. Revisá ese WhatsApp." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm("¿Desvincular el número? Los avisos automáticos dejan de salir hasta que lo vincules de nuevo.")) return;
    setBusy(true);
    try {
      const r = await api<{ loggedOut: boolean }>("/api/admin/wa", { method: "DELETE" });
      setMsg({
        ok: true,
        text: r.loggedOut ? "Número desvinculado." : "Se borró la sesión de la web. Si el dispositivo sigue en WhatsApp → Dispositivos vinculados, cerralo desde el celular.",
      });
      onChange();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {state.linked ? (
        <>
          <p className="pos" style={{ marginBottom: 6 }}>
            ✓ Vinculado: <b>{state.number ? prettyPhone(state.number) : "número del local"}</b>
          </p>
          <p className="hint" style={{ fontSize: 13.5, marginBottom: 12 }}>
            {state.linkedAt && <>Desde {when(state.linkedAt)}. </>}
            {state.lastOkAt && <>Último aviso enviado: {when(state.lastOkAt)}. </>}
          </p>
          {state.lastError && <p className="neg" style={{ fontSize: 14 }}>Último error: {state.lastError}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", margin: "12px 0" }}>
            <div className="field" style={{ minWidth: 220 }}>
              <label>Mandar un mensaje de prueba a</label>
              <input className="input" type="tel" value={test} onChange={(e) => setTest(e.target.value)} placeholder="2323 45 6789" />
            </div>
            <button type="button" className="btn ghost sm" disabled={busy || test.replace(/\D/g, "").length < 8} onClick={sendTest}>
              Enviar prueba
            </button>
            <button type="button" className="btn danger sm" disabled={busy} onClick={unlink}>
              Desvincular número
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint" style={{ fontSize: 14, marginBottom: 12 }}>
            Todavía no hay un número vinculado: los avisos se simulan. Abrí WhatsApp (o WhatsApp Business) en el celular del local y vinculalo como un dispositivo más.
          </p>
          {mode === "idle" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <button type="button" className="btn" onClick={() => start("qr")}>Vincular con QR</button>
                <p className="hint" style={{ fontSize: 13, marginTop: 6 }}>Usalo desde una compu: en el celular, WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escaneá.</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ minWidth: 220 }}>
                  <label>Vincular desde este mismo celular: número del local</label>
                  <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2323 45 6789" />
                </div>
                <button type="button" className="btn ghost" onClick={() => start("code")}>Vincular con código</button>
              </div>
            </div>
          )}
          {mode === "qr" && (
            <div>
              {qrImg ? (
                <img src={qrImg} alt="Código QR para vincular WhatsApp" width={280} height={280} style={{ background: "#fff", borderRadius: 8, maxWidth: "100%", height: "auto" }} />
              ) : (
                <p className="hint">Generando el QR…</p>
              )}
              <p className="hint" style={{ fontSize: 13.5, margin: "10px 0" }}>WhatsApp → Dispositivos vinculados → Vincular un dispositivo. El QR se renueva solo; tenés cerca de un minuto.</p>
            </div>
          )}
          {mode === "code" && (
            <div>
              {code ? (
                <>
                  <p style={{ fontFamily: "var(--display)", fontSize: 40, letterSpacing: "0.12em", margin: "4px 0" }}>{code}</p>
                  <p className="hint" style={{ fontSize: 13.5, margin: "6px 0 10px" }}>
                    En el celular: WhatsApp → Dispositivos vinculados → Vincular un dispositivo → <b>Vincular con el número de teléfono</b>, e ingresá este código. Tenés cerca de un minuto.
                  </p>
                </>
              ) : (
                <p className="hint">Pidiendo el código…</p>
              )}
            </div>
          )}
          {mode !== "idle" && (
            <button type="button" className="btn ghost sm" onClick={cancel}>
              {waiting ? "Cancelar" : "Cerrar"}
            </button>
          )}
        </>
      )}
      {msg && (
        <p className={msg.ok ? "pos" : "neg"} style={{ marginTop: 10 }} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
