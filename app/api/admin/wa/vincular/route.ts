import { isAdmin } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { pairWhatsApp } from "@/lib/wa-baileys";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vincula el número. Responde con un stream de eventos:
 *   qr (texto del QR, se renueva solo), code (código de 8 dígitos), done, fail.
 * Si viene ?phone=... se usa el código de 8 dígitos (sirve para vincular desde el mismo celular).
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const raw = new URL(req.url).searchParams.get("phone");
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && !phone) return Response.json({ error: "Teléfono inválido. Poné el código de área." }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };
      try {
        const res = await pairWhatsApp({
          phone: phone ?? undefined,
          onQr: (qr) => send("qr", { qr }),
          onCode: (code) => send("code", { code }),
          signal: req.signal,
        });
        send("done", res);
      } catch (e) {
        send("fail", { error: (e as Error).message });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
