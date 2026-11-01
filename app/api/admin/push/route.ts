import { body, guard, json } from "@/lib/http";
import { listSubs, notifyAdmins, pushConfigured, pushPublicKey, removeSub, saveSub, validSub } from "@/lib/push";

export const dynamic = "force-dynamic";

export const GET = guard(async () => {
  const configured = pushConfigured();
  return json({ configured, publicKey: configured ? pushPublicKey() : "", devices: configured ? (await listSubs()).length : 0 });
}, { admin: true });

/** Registra el celular que activó los avisos. */
export const POST = guard(async (req) => {
  if (!pushConfigured()) return json({ error: "Faltan las claves VAPID en Vercel (ver README)." }, 503);
  const b = await body(req);
  if (!validSub(b.subscription)) return json({ error: "Suscripción inválida." }, 400);
  await saveSub(b.subscription, req.headers.get("user-agent") ?? "");
  return json({ ok: true, devices: (await listSubs()).length });
}, { admin: true });

export const DELETE = guard(async (req) => {
  const b = await body(req);
  if (typeof b.endpoint === "string") await removeSub(b.endpoint);
  return json({ ok: true, devices: (await listSubs()).length });
}, { admin: true });

/** Aviso de prueba. */
export const PUT = guard(async () => {
  const r = await notifyAdmins({ title: "Avisos activados ✓", body: "Así te va a llegar cada turno nuevo.", tag: "prueba" });
  if (r.sent === 0) return json({ error: r.error ?? "No hay ningún celular registrado.", ...r }, 409);
  return json({ ok: true, ...r });
}, { admin: true });
