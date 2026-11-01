/**
 * Envío por WhatsApp con un número vinculado como "dispositivo vinculado" (Baileys).
 *
 * En Vercel no se puede dejar una conexión abierta, así que:
 *  - la sesión (credenciales + claves) vive en Redis;
 *  - cada envío se conecta, manda el mensaje y se desconecta;
 *  - un candado en Redis evita dos conexiones a la vez con la misma sesión.
 *
 * Es una vía NO oficial: WhatsApp puede bloquear el número.
 */
import type { AuthenticationCreds, SignalDataTypeMap, WASocket } from "@whiskeysockets/baileys";
import pino from "pino";
import { getStore, getStoreOrNull, keys } from "./db";

type Baileys = typeof import("@whiskeysockets/baileys");
const load = (): Promise<Baileys> => import("@whiskeysockets/baileys");
const logger = pino({ level: "silent" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type WaState = { linked: boolean; number?: string; linkedAt?: string; lastOkAt?: string; lastError?: string };
export type WaSendResult = { ok: boolean; simulated?: boolean; id?: string; error?: string };

/* ------------------------------------------------------------------ */
/* Estado                                                               */
/* ------------------------------------------------------------------ */

export async function getWaState(): Promise<WaState> {
  const db = getStoreOrNull();
  if (!db) return { linked: false };
  return (await db.get<WaState>(keys.waState)) ?? { linked: false };
}

async function patchState(patch: Partial<WaState>) {
  const cur = await getWaState();
  await getStore().set(keys.waState, { ...cur, ...patch });
}

/* ------------------------------------------------------------------ */
/* Sesión en Redis                                                      */
/* ------------------------------------------------------------------ */

type Auth = {
  creds: AuthenticationCreds;
  keyStore: {
    get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]): Promise<{ [id: string]: SignalDataTypeMap[T] }>;
    set(data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null } }): Promise<void>;
  };
  save: () => Promise<void>; // guarda credenciales (en cola, nunca dos a la vez)
};

export async function loadAuth(B: Baileys): Promise<Auth> {
  const db = getStore();
  const parse = (v: unknown) => JSON.parse(typeof v === "string" ? v : JSON.stringify(v), B.BufferJSON.reviver);
  const rawCreds = await db.get<unknown>(keys.waCreds);
  const creds: AuthenticationCreds = rawCreds ? parse(rawCreds) : B.initAuthCreds();

  // Un solo comando para traer todas las claves; después se trabaja en memoria y se escribe lo que cambia.
  const cache = new Map<string, unknown>();
  for (const [k, v] of Object.entries(await db.hgetall<unknown>(keys.waKeys))) cache.set(k, parse(v));

  let chain: Promise<void> = Promise.resolve();
  const save = () => {
    chain = chain.then(() => db.set(keys.waCreds, JSON.stringify(creds, B.BufferJSON.replacer)).then(() => undefined));
    return chain;
  };

  const keyStore: Auth["keyStore"] = {
    get: async (type, ids) => {
      const out: Record<string, unknown> = {};
      for (const id of ids) {
        let value = cache.get(`${type}:${id}`) ?? null;
        if (type === "app-state-sync-key" && value) value = B.proto.Message.AppStateSyncKeyData.fromObject(value as object);
        out[id] = value;
      }
      return out as never;
    },
    set: async (data) => {
      const tasks: Promise<void>[] = [];
      for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
        for (const [id, value] of Object.entries(data[type] ?? {})) {
          const field = `${type}:${id}`;
          if (value) {
            cache.set(field, value);
            tasks.push(db.hset(keys.waKeys, field, JSON.stringify(value, B.BufferJSON.replacer)));
          } else {
            cache.delete(field);
            tasks.push(db.hdel(keys.waKeys, field));
          }
        }
      }
      await Promise.all(tasks);
    },
  };
  return { creds, keyStore, save };
}

async function wipeSession() {
  const db = getStore();
  await db.del(keys.waCreds, keys.waKeys);
  await db.set(keys.waState, { linked: false });
}

/* ------------------------------------------------------------------ */
/* Candado                                                              */
/* ------------------------------------------------------------------ */

async function withLock<T>(fn: () => Promise<T>, waitMs = 25_000): Promise<T> {
  const db = getStore();
  const token = Math.random().toString(36).slice(2);
  const until = Date.now() + waitMs;
  while (!(await db.set(keys.waLock, token, { nx: true, ex: 90 }))) {
    if (Date.now() > until) throw new Error("WhatsApp está ocupado enviando otro mensaje. Probá de nuevo en un momento.");
    await sleep(1500);
  }
  try {
    return await fn();
  } finally {
    await db.del(keys.waLock).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Conexión                                                             */
/* ------------------------------------------------------------------ */

async function makeSocket(B: Baileys, auth: Auth): Promise<WASocket> {
  const sock = B.makeWASocket({
    auth: { creds: auth.creds, keys: B.makeCacheableSignalKeyStore(auth.keyStore as never, logger) },
    logger,
    browser: B.Browsers.macOS("Chrome"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: async () => undefined,
  });
  sock.ev.on("creds.update", () => {
    void auth.save().catch((e) => console.error("wa: no se pudo guardar la sesión", e));
  });
  return sock;
}

const statusOf = (e: unknown) => (e as { output?: { statusCode?: number } })?.output?.statusCode;

/** Espera a que la conexión quede abierta. Rechaza si se cierra antes. */
function waitOpen(sock: WASocket, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("WhatsApp no respondió a tiempo.")), ms);
    sock.ev.on("connection.update", (u) => {
      if (u.connection === "open") {
        clearTimeout(t);
        resolve();
      } else if (u.connection === "close") {
        clearTimeout(t);
        const code = statusOf(u.lastDisconnect?.error);
        reject(Object.assign(new Error(code === 401 ? "La sesión de WhatsApp se cerró." : "Se cortó la conexión con WhatsApp."), { code }));
      }
    });
  });
}

const closeQuietly = (sock?: WASocket) => {
  try {
    sock?.end(undefined);
  } catch {}
};

/* ------------------------------------------------------------------ */
/* Enviar                                                               */
/* ------------------------------------------------------------------ */

/** `to`: teléfono canónico (549 + 10 dígitos). Sin número vinculado no manda nada (modo prueba). */
export async function sendWhatsAppText(to: string, text: string): Promise<WaSendResult> {
  if (!getStoreOrNull()) return { ok: false, error: "Falta la base de datos." };
  const state = await getWaState();
  if (!state.linked) return { ok: true, simulated: true };

  try {
    return await withLock(async () => {
      const B = await load();
      const auth = await loadAuth(B);
      if (!auth.creds.me) {
        await patchState({ linked: false, lastError: "La sesión no está completa. Volvé a vincular el número." });
        return { ok: false, error: "La sesión no está completa. Volvé a vincular el número." };
      }
      let sock: WASocket | undefined;
      try {
        sock = await makeSocket(B, auth);
        await waitOpen(sock, 25_000);

        let jid = `${to}@s.whatsapp.net`;
        try {
          const found = (await sock.onWhatsApp(jid))?.[0];
          if (found && !found.exists) return { ok: false, error: "Ese número no tiene WhatsApp." };
          if (found?.jid) jid = found.jid;
        } catch {
          // si la consulta falla, se intenta igual con el número tal cual
        }

        const msg = await sock.sendMessage(jid, { text });
        await sleep(2000); // tiempo para que se asienten las claves de cifrado antes de cortar
        await auth.save();
        await patchState({ lastOkAt: new Date().toISOString(), lastError: undefined });
        return { ok: true, id: msg?.key?.id ?? undefined };
      } catch (e) {
        if ((e as { code?: number }).code === 401) {
          await wipeSession();
          await patchState({ linked: false, lastError: "WhatsApp cerró la sesión. Hay que volver a vincular el número." });
        } else {
          await patchState({ lastError: (e as Error).message }).catch(() => {});
        }
        return { ok: false, error: (e as Error).message };
      } finally {
        closeQuietly(sock);
        await auth.save().catch(() => {});
      }
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/* Vincular (QR o código de 8 dígitos)                                  */
/* ------------------------------------------------------------------ */

export async function pairWhatsApp(opts: {
  phone?: string; // si viene, se usa código de 8 dígitos en vez de QR
  onQr: (qr: string) => void;
  onCode: (code: string) => void;
  signal?: AbortSignal;
  budgetMs?: number;
}): Promise<{ number: string }> {
  if ((await getWaState()).linked) throw new Error("Ya hay un número vinculado. Desvinculalo primero.");
  return withLock(async () => {
    const B = await load();
    await wipeSession(); // arranca de cero: nada de restos de intentos anteriores
    const auth = await loadAuth(B);
    const deadline = Date.now() + (opts.budgetMs ?? 55_000);
    let codeAsked = false;
    let sock: WASocket | undefined;

    try {
      // WhatsApp corta la conexión justo después de escanear y pide reconectar (515): se repite hasta que quede abierta.
      for (let attempt = 0; attempt < 4; attempt++) {
        sock = await makeSocket(B, auth);
        const s = sock;
        const outcome = await new Promise<"open" | "restart">((resolve, reject) => {
          const left = deadline - Date.now();
          if (left <= 0) return reject(new Error("Se terminó el tiempo. Probá de nuevo."));
          const t = setTimeout(() => reject(new Error("Se terminó el tiempo. Probá de nuevo.")), left);
          opts.signal?.addEventListener("abort", () => reject(new Error("Cancelado.")), { once: true });
          s.ev.on("connection.update", async (u) => {
            if (u.qr) {
              if (opts.phone) {
                if (!codeAsked) {
                  codeAsked = true;
                  try {
                    opts.onCode(await s.requestPairingCode(opts.phone));
                  } catch (e) {
                    clearTimeout(t);
                    reject(new Error(`No se pudo pedir el código: ${(e as Error).message}`));
                  }
                }
              } else opts.onQr(u.qr);
            }
            if (u.connection === "open") {
              clearTimeout(t);
              resolve("open");
            } else if (u.connection === "close") {
              clearTimeout(t);
              const code = statusOf(u.lastDisconnect?.error);
              if (code === B.DisconnectReason.restartRequired) resolve("restart");
              else reject(new Error(code === 401 ? "WhatsApp rechazó la vinculación." : "Se cortó la conexión con WhatsApp."));
            }
          });
        });
        if (outcome === "open") break;
        closeQuietly(sock);
        await auth.save();
        sock = undefined;
        if (attempt === 3) throw new Error("WhatsApp no terminó de vincular. Probá de nuevo.");
      }

      await sleep(2500); // deja que lleguen las claves iniciales
      await auth.save();
      const number = (auth.creds.me?.id ?? "").split(":")[0].split("@")[0];
      await getStore().set(keys.waState, { linked: true, number, linkedAt: new Date().toISOString() } satisfies WaState);
      return { number };
    } catch (e) {
      await wipeSession().catch(() => {});
      throw e;
    } finally {
      closeQuietly(sock);
    }
  }, 5_000);
}

/** Cierra la sesión en WhatsApp (si se puede) y borra todo lo guardado. */
export async function unlinkWhatsApp(): Promise<{ loggedOut: boolean }> {
  let loggedOut = false;
  if ((await getWaState()).linked) {
    try {
      await withLock(async () => {
        const B = await load();
        const auth = await loadAuth(B);
        let sock: WASocket | undefined;
        try {
          sock = await makeSocket(B, auth);
          await waitOpen(sock, 15_000);
          await sock.logout();
          loggedOut = true;
        } finally {
          closeQuietly(sock);
        }
      }, 8_000);
    } catch {
      // si no hay conexión, igual se borra la sesión de nuestro lado
    }
  }
  await wipeSession();
  return { loggedOut };
}
