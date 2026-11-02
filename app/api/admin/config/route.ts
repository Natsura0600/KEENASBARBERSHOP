import { getConfig } from "@/lib/data";
import { getStore, keys } from "@/lib/db";
import { isValidTime, toMin } from "@/lib/dates";
import { body, guard, json, str } from "@/lib/http";
import type { Config, DayHours } from "@/lib/types";
import { invalidateSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const GET = guard(async () => json(await getConfig()), { admin: true });

export const PUT = guard(async (req) => {
  const b = await body(req);
  const current = await getConfig();

  const hours: Record<string, DayHours> = {};
  const rawHours = (b.hours ?? {}) as Record<string, unknown>;
  for (let d = 0; d < 7; d++) {
    const h = rawHours[String(d)] as { open?: unknown; close?: unknown } | null | undefined;
    if (h && isValidTime(h.open) && isValidTime(h.close) && toMin(h.close) > toMin(h.open)) {
      hours[String(d)] = { open: h.open, close: h.close };
    } else {
      hours[String(d)] = null;
    }
  }

  const num = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const coord = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

  const next: Config = {
    name: str(b.name, 60) || current.name,
    tagline: str(b.tagline, 140),
    barber: str(b.barber, 60),
    about: str(b.about, 600),
    address: str(b.address, 100) || current.address,
    city: str(b.city, 80),
    lat: coord(b.lat, current.lat),
    lng: coord(b.lng, current.lng),
    whatsapp: str(b.whatsapp, 20).replace(/\D/g, ""),
    instagram: str(b.instagram, 40).replace(/^@/, "").replace(/[^\w.]/g, ""),
    slotMinutes: num(b.slotMinutes, 10, 120, current.slotMinutes),
    maxDaysAhead: num(b.maxDaysAhead, 1, 90, current.maxDaysAhead),
    conditions: str(b.conditions, 500),
    hours,
  };
  await getStore().set(keys.config, next);
  invalidateSite();
  return json({ ok: true, config: next });
}, { admin: true });
