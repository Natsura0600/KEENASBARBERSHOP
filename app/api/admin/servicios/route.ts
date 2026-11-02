import { getServices, newId } from "@/lib/data";
import { getStore, keys } from "@/lib/db";
import { body, guard, json, money, str } from "@/lib/http";
import type { Service } from "@/lib/types";
import { invalidateSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const GET = guard(async () => json(await getServices()), { admin: true });

export const PUT = guard(async (req) => {
  const b = await body(req);
  const raw = Array.isArray(b.services) ? b.services : null;
  if (!raw || raw.length > 30) return json({ error: "Datos inválidos" }, 400);

  const seen = new Set<string>();
  const services: Service[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const name = str(r.name, 60);
    const price = money(r.price, 10_000_000);
    const duration = Math.round(Number(r.duration));
    if (!name || price === null || !Number.isFinite(duration) || duration < 10 || duration > 300) {
      return json({ error: `Revisá el servicio "${name || "sin nombre"}": nombre, precio y duración (10 a 300 min).` }, 400);
    }
    let id = str(r.id, 40).replace(/[^\w-]/g, "") || newId("s_");
    while (seen.has(id)) id = newId("s_");
    seen.add(id);

    const onlyDays = Array.isArray(r.onlyDays)
      ? [...new Set((r.onlyDays as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
      : [];
    services.push({
      id,
      name,
      detail: str(r.detail, 140),
      price,
      duration,
      active: r.active !== false,
      ...(onlyDays.length ? { onlyDays } : {}),
    });
  }
  await getStore().set(keys.services, services);
  invalidateSite();
  return json({ ok: true, services });
}, { admin: true });
