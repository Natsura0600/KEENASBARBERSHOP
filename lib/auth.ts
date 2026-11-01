import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE = "kb_admin";
const MAX_AGE = 60 * 60 * 12; // 12 horas

function secret(): string | null {
  const s = process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD;
  return s && s.length >= 6 ? s : null;
}

function sign(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkPassword(input: string): boolean {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return false;
  // Se comparan hashes para no filtrar el largo de la contraseña.
  const h = (v: string) => createHmac("sha256", "kb-pass").update(v).digest("hex");
  return safeEqual(h(input), h(pass));
}

export function createSessionValue(): string | null {
  const key = secret();
  if (!key) return null;
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return `${exp}.${sign(String(exp), key)}`;
}

export const sessionMaxAge = MAX_AGE;

export async function isAdmin(): Promise<boolean> {
  const key = secret();
  if (!key) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, sign(exp, key));
}
