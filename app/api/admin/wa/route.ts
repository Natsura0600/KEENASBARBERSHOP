import { getConfig } from "@/lib/data";
import { body, guard, json, str } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import { getWaState, sendWhatsAppText, unlinkWhatsApp } from "@/lib/wa-baileys";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = guard(async () => json(await getWaState()), { admin: true });

/** Mensaje de prueba al número que se indique. */
export const POST = guard(async (req) => {
  const b = await body(req);
  const phone = normalizePhone(str(b.phone, 30));
  if (!phone) return json({ error: "Teléfono inválido. Poné el código de área, por ejemplo 2323 45-6789." }, 400);
  const state = await getWaState();
  if (!state.linked) return json({ error: "Todavía no hay un número vinculado." }, 409);
  const shop = (await getConfig()).name;
  const res = await sendWhatsAppText(phone, `Mensaje de prueba de ${shop}. Si lo ves, los avisos automáticos están funcionando.`);
  if (!res.ok) return json({ error: res.error ?? "No se pudo enviar." }, 502);
  return json({ ok: true });
}, { admin: true });

export const DELETE = guard(async () => json({ ok: true, ...(await unlinkWhatsApp()) }), { admin: true });
