import { cashSummary, deleteCashEntry, newId, saveCashEntry } from "@/lib/data";
import { isValidDate, nowAR } from "@/lib/dates";
import { body, guard, json, money, str } from "@/lib/http";
import type { PayMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

const METHODS: PayMethod[] = ["efectivo", "transferencia", "otro"];

export const GET = guard(async (req) => {
  const p = new URL(req.url).searchParams;
  const mode = p.get("mode") === "month" ? "month" : "week";
  const ref = p.get("ref") ?? nowAR().date;
  if (!isValidDate(ref)) return json({ error: "Fecha inválida" }, 400);
  return json(await cashSummary(mode, ref));
}, { admin: true });

export const POST = guard(async (req) => {
  const b = await body(req);
  const amount = money(b.amount);
  const concept = str(b.concept, 80);
  if (!isValidDate(b.date)) return json({ error: "Fecha inválida" }, 400);
  if (!amount || amount <= 0) return json({ error: "Poné un monto mayor a 0." }, 400);
  if (!concept) return json({ error: "Poné un concepto." }, 400);

  const entry = {
    id: newId("c_"),
    date: b.date,
    type: b.type === "egreso" ? ("egreso" as const) : ("ingreso" as const),
    amount,
    method: METHODS.includes(b.method as PayMethod) ? (b.method as PayMethod) : ("efectivo" as const),
    concept,
  };
  await saveCashEntry(entry);
  return json({ ok: true, entry });
}, { admin: true });

export const DELETE = guard(async (req) => {
  const p = new URL(req.url).searchParams;
  const date = p.get("date");
  const id = p.get("id");
  if (!isValidDate(date) || !id) return json({ error: "Datos inválidos" }, 400);
  await deleteCashEntry(date, id);
  return json({ ok: true });
}, { admin: true });
