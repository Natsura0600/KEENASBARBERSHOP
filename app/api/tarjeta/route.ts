import { nowAR } from "@/lib/dates";
import { allow, body, guard, json, str } from "@/lib/http";
import { effectiveStatus, getClient, getLoyalty, listRewards } from "@/lib/loyalty";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/** Consulta pública: el cliente pone su teléfono y ve cuántos sellos lleva. No devuelve nombre ni códigos. */
export const POST = guard(async (req) => {
  if (!(await allow("tarjeta", req, 12, 60 * 60))) {
    return json({ error: "Demasiadas consultas. Probá de nuevo en un rato." }, 429);
  }
  const cfg = await getLoyalty();
  if (!cfg.enabled) return json({ enabled: false });

  const b = await body(req);
  const phone = normalizePhone(str(b.phone, 30));
  if (!phone) return json({ error: "Revisá el teléfono. Poné el código de área, por ejemplo 2323 45-6789." }, 400);

  const client = await getClient(phone);
  const base = { enabled: true, required: cfg.cutsRequired, rewardName: cfg.rewardName };
  if (!client) return json({ ...base, found: false });

  const today = nowAR().date;
  const pending = (await listRewards()).filter((r) => r.phone === phone && effectiveStatus(r, today) === "pending");
  return json({
    ...base,
    found: true,
    stamps: client.stamps,
    total: client.total,
    rewards: pending.length,
    expiresOn: pending.map((r) => r.expiresOn).filter(Boolean).sort()[0],
  });
}, {});
