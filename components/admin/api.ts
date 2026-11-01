export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    cache: "no-store",
    ...rest,
    headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.endsWith("/login")) {
    window.location.reload();
    throw new Error("La sesión venció. Volvé a entrar.");
  }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Algo salió mal.");
  return data as T;
}

export function waNumber(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("54")) return d;
  d = d.replace(/^0+/, "");
  return `549${d.replace(/^(\d{2,4})15/, "$1")}`;
}
