import { toWhatsApp } from "./phone";

/**
 * Envío de plantillas por la WhatsApp Business Platform (Cloud API de Meta).
 *
 * Variables de entorno:
 *   WHATSAPP_TOKEN            token permanente (usuario del sistema) con permiso whatsapp_business_messaging
 *   WHATSAPP_PHONE_NUMBER_ID  ID del número (no es el teléfono: sale en el panel de Meta)
 *   WHATSAPP_API_VERSION      opcional, por defecto v23.0
 *   WHATSAPP_AR_FORMAT        opcional: "with9" (549…, por defecto) o "without9" (54…)
 *   WHATSAPP_API_BASE         opcional, solo para pruebas (servidor falso)
 *
 * Si falta el token o el ID, funciona en MODO PRUEBA: no envía nada y devuelve simulated=true.
 */

export type WaStatus = { configured: boolean; mode: "api" | "prueba"; version: string; format: "with9" | "without9" };

export function waStatus(): WaStatus {
  const configured = Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  return {
    configured,
    mode: configured ? "api" : "prueba",
    version: process.env.WHATSAPP_API_VERSION || "v23.0",
    format: process.env.WHATSAPP_AR_FORMAT === "without9" ? "without9" : "with9",
  };
}

export type SendResult = { ok: boolean; simulated?: boolean; id?: string; error?: string };

/** Meta rechaza variables con saltos de línea, tabulaciones o más de 4 espacios seguidos. */
export function cleanParam(v: string): string {
  return v.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 500) || "-";
}

export async function sendTemplate(input: {
  to: string; // número canónico (549…)
  name: string;
  language: string;
  params: string[];
}): Promise<SendResult> {
  const st = waStatus();
  const to = toWhatsApp(input.to, st.format);
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: input.name,
      language: { code: input.language },
      ...(input.params.length
        ? { components: [{ type: "body", parameters: input.params.map((t) => ({ type: "text", text: cleanParam(t) })) }] }
        : {}),
    },
  };

  if (!st.configured) {
    console.log("[whatsapp:prueba] no se envía (faltan credenciales). Mensaje:", JSON.stringify(body));
    return { ok: true, simulated: true };
  }

  const base = process.env.WHATSAPP_API_BASE || "https://graph.facebook.com";
  try {
    const res = await fetch(`${base}/${st.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { code?: number; message?: string; error_data?: { details?: string } };
    };
    if (!res.ok || data.error) {
      const e = data.error;
      const detail = [e?.message, e?.error_data?.details].filter(Boolean).join(" — ");
      return { ok: false, error: `WhatsApp ${e?.code ?? res.status}: ${detail || "error desconocido"}`.slice(0, 400) };
    }
    return { ok: true, id: data.messages?.[0]?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error de red";
    return { ok: false, error: `No se pudo conectar con WhatsApp: ${msg}`.slice(0, 400) };
  }
}
