import { getConfig, getServices } from "@/lib/data";
import { cleanLoyalty, effectiveStatus, getLoyalty, listClients, listRewards, suggestedTemplateText } from "@/lib/loyalty";
import { getStore, keys } from "@/lib/db";
import { nowAR } from "@/lib/dates";
import { body, guard, json } from "@/lib/http";
import { getWaState } from "@/lib/wa-baileys";
import { waStatus } from "@/lib/whatsapp";
import { getSite, invalidateSite } from "@/lib/site";

export const dynamic = "force-dynamic";

async function payload() {
  const [site, clients, rewards, baileys] = await Promise.all([getSite({ fresh: true }), listClients(), listRewards(), getWaState()]);
  const { config, loyalty, services } = site;
  const today = nowAR().date;
  return {
    config: loyalty,
    whatsapp: waStatus(),
    baileys,
    shop: config.name,
    services: services.map((s) => ({ id: s.id, name: s.name, active: s.active })),
    suggested: suggestedTemplateText(loyalty.template.vars),
    stats: {
      clients: clients.length,
      withOptIn: clients.filter((c) => c.optIn).length,
      pending: rewards.filter((r) => effectiveStatus(r, today) === "pending").length,
      redeemed: rewards.filter((r) => r.status === "redeemed").length,
    },
  };
}

export const GET = guard(async () => json(await payload()), { admin: true });

export const PUT = guard(async (req) => {
  const b = await body(req);
  const { loyalty: current, services } = await getSite({ fresh: true });
  const next = cleanLoyalty(b, current, services.map((s) => s.id));
  await getStore().set(keys.loyalty, next);
  invalidateSite();
  return json({ ok: true, ...(await payload()) });
}, { admin: true });
