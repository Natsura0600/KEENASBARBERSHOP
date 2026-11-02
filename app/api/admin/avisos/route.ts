import { getNotices, newId } from "@/lib/data";
import { getStore, keys } from "@/lib/db";
import { isValidDate } from "@/lib/dates";
import { body, guard, json, str } from "@/lib/http";
import type { Notice } from "@/lib/types";
import { invalidateSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const GET = guard(async () => json(await getNotices(false)), { admin: true });

export const PUT = guard(async (req) => {
  const b = await body(req);
  const raw = Array.isArray(b.notices) ? b.notices : null;
  if (!raw || raw.length > 30) return json({ error: "Datos inválidos" }, 400);

  const notices: Notice[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const text = str(r.text, 300);
    if (!text) continue;
    notices.push({
      id: str(r.id, 40).replace(/[^\w-]/g, "") || newId("n_"),
      title: str(r.title, 60),
      text,
      kind: r.kind === "importante" ? "importante" : "info",
      active: r.active !== false,
      ...(isValidDate(r.expiresOn) ? { expiresOn: r.expiresOn } : {}),
    });
  }
  await getStore().set(keys.notices, notices);
  invalidateSite();
  return json({ ok: true, notices });
}, { admin: true });
