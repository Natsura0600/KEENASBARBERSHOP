import { COOKIE } from "@/lib/auth";
import { guard, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = guard(async () => {
  const res = json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});
