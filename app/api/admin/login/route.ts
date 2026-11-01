import { COOKIE, checkPassword, createSessionValue, sessionMaxAge } from "@/lib/auth";
import { allow, body, guard, json, str } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = guard(async (req) => {
  if (!process.env.ADMIN_PASSWORD) {
    return json({ error: "Falta definir ADMIN_PASSWORD en las variables de entorno." }, 503);
  }
  if (!(await allow("login", req, 8, 15 * 60))) {
    return json({ error: "Demasiados intentos. Esperá 15 minutos." }, 429);
  }
  const b = await body(req);
  if (!checkPassword(str(b.password, 200))) {
    return json({ error: "Contraseña incorrecta." }, 401);
  }
  const value = createSessionValue();
  if (!value) return json({ error: "Falta ADMIN_SECRET o la contraseña es muy corta." }, 503);

  const res = json({ ok: true });
  res.cookies.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge,
  });
  return res;
});
