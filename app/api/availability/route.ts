import { availability, getConfig, getServices } from "@/lib/data";
import { isValidDate } from "@/lib/dates";
import { guard, json } from "@/lib/http";
import { getSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const GET = guard(async (req) => {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const serviceId = url.searchParams.get("serviceId");
  if (!isValidDate(date)) return json({ error: "Fecha inválida" }, 400);

  const { config, services } = await getSite();
  const service = services.find((s) => s.id === serviceId && s.active);
  if (!service) return json({ error: "Servicio inválido" }, 400);

  return json(await availability(config, service, date));
});
