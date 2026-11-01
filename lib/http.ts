import { NextResponse } from "next/server";
import { isAdmin } from "./auth";
import { BookingError } from "./data";
import { MissingDatabaseError, getStore, keys } from "./db";

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

/** true si todavía puede intentar */
export async function allow(name: string, req: Request, max: number, ttlSeconds: number) {
  const n = await getStore().incr(keys.rate(name, clientIp(req)), ttlSeconds);
  return n <= max;
}

type Handler = (req: Request) => Promise<Response>;

export function guard(handler: Handler, opts: { admin?: boolean } = {}): Handler {
  return async (req) => {
    try {
      if (opts.admin && !(await isAdmin())) return json({ error: "No autorizado" }, 401);
      return await handler(req);
    } catch (e) {
      if (e instanceof MissingDatabaseError) return json({ error: e.message }, 503);
      if (e instanceof BookingError) return json({ error: e.message }, 409);
      if (e instanceof SyntaxError) return json({ error: "Datos inválidos" }, 400);
      console.error(e);
      return json({ error: "Error interno" }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  const data = await req.json();
  if (typeof data !== "object" || data === null) throw new SyntaxError("body");
  return data as T;
}

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const money = (v: unknown, max = 100_000_000) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
