import { Redis } from "@upstash/redis";

type SetOpts = { nx?: boolean; ex?: number };

export interface Store {
  get<T>(key: string): Promise<T | null>;
  /** Varias claves en un solo comando (Upstash lo cuenta como 1). */
  mget(keys: string[]): Promise<unknown[]>;
  set(key: string, value: unknown, opts?: SetOpts): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hset(key: string, field: string, value: unknown): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  incr(key: string, ttlSeconds: number): Promise<number>;
}

export class MissingDatabaseError extends Error {
  constructor() {
    super(
      "Falta configurar la base de datos. Cargá UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN (ver README).",
    );
  }
}

/* ---------------- Upstash Redis ---------------- */

function upstashStore(redis: Redis): Store {
  return {
    async get<T>(key: string) {
      return (await redis.get<T>(key)) ?? null;
    },
    async mget(ks) {
      return ks.length ? ((await redis.mget(...ks)) as unknown[]).map((v) => v ?? null) : [];
    },
    async set(key, value, opts) {
      const res = await redis.set(key, value as string, opts as never);
      return res === "OK";
    },
    async del(...keys) {
      if (keys.length) await redis.del(...keys);
    },
    async hget<T>(key: string, field: string) {
      return (await redis.hget<T>(key, field)) ?? null;
    },
    async hgetall<T>(key: string) {
      return ((await redis.hgetall(key)) as Record<string, T> | null) ?? {};
    },
    async hset(key, field, value) {
      await redis.hset(key, { [field]: value });
    },
    async hdel(key, field) {
      await redis.hdel(key, field);
    },
    async incr(key, ttl) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, ttl);
      return n;
    },
  };
}

/* ---------------- Modo memoria (solo desarrollo local) ---------------- */

type MemShape = {
  kv: Map<string, { v: unknown; exp?: number }>;
  hashes: Map<string, Map<string, unknown>>;
};

function memoryStore(): Store {
  const g = globalThis as unknown as { __mem?: MemShape };
  const mem = (g.__mem ??= {
    kv: new Map<string, { v: unknown; exp?: number }>(),
    hashes: new Map<string, Map<string, unknown>>(),
  });
  const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const alive = (key: string) => {
    const e = mem.kv.get(key);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) {
      mem.kv.delete(key);
      return null;
    }
    return e;
  };
  return {
    async get<T>(key: string) {
      const e = alive(key);
      return e ? (clone(e.v) as T) : null;
    },
    async mget(ks) {
      return ks.map((k) => {
        const e = alive(k);
        return e ? clone(e.v) : null;
      });
    },
    async set(key, value, opts) {
      if (opts?.nx && alive(key)) return false;
      mem.kv.set(key, {
        v: clone(value),
        exp: opts?.ex ? Date.now() + opts.ex * 1000 : undefined,
      });
      return true;
    },
    async del(...keys) {
      for (const k of keys) {
        mem.kv.delete(k);
        mem.hashes.delete(k);
      }
    },
    async hget<T>(key: string, field: string) {
      const v = mem.hashes.get(key)?.get(field);
      return v === undefined ? null : (clone(v) as T);
    },
    async hgetall<T>(key: string) {
      const h = mem.hashes.get(key);
      const out: Record<string, T> = {};
      h?.forEach((v, f) => (out[f] = clone(v) as T));
      return out;
    },
    async hset(key, field, value) {
      if (!mem.hashes.has(key)) mem.hashes.set(key, new Map());
      mem.hashes.get(key)!.set(field, clone(value));
    },
    async hdel(key, field) {
      mem.hashes.get(key)?.delete(field);
    },
    async incr(key, ttl) {
      const e = alive(key);
      const n = (typeof e?.v === "number" ? e.v : 0) + 1;
      mem.kv.set(key, { v: n, exp: e?.exp ?? Date.now() + ttl * 1000 });
      return n;
    },
  };
}

/* ---------------- Selección ---------------- */

let cached: Store | null | undefined;

/** Devuelve null si no hay base configurada (la web pública usa los datos por defecto). */
export function getStoreOrNull(): Store | null {
  if (cached !== undefined) return cached;
  // Acepta las variables de Upstash directas y las que crea la integración de Vercel Marketplace.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    cached = upstashStore(new Redis({ url, token }));
  } else if (process.env.NODE_ENV !== "production") {
    cached = memoryStore();
  } else {
    cached = null;
  }
  return cached;
}

export function getStore(): Store {
  const s = getStoreOrNull();
  if (!s) throw new MissingDatabaseError();
  return s;
}

export const keys = {
  config: "kb:config",
  services: "kb:services",
  notices: "kb:notices",
  day: (date: string) => `kb:turnos:${date}`,
  lock: (date: string, time: string) => `kb:lock:${date}:${time}`,
  cash: (month: string) => `kb:caja:${month}`,
  rate: (name: string, ip: string) => `kb:rate:${name}:${ip}`,
  loyalty: "kb:fidelidad",
  clients: "kb:clientes",
  rewards: "kb:premios",
  push: "kb:push",
  waCreds: "kb:wa:creds",
  waKeys: "kb:wa:keys",
  waLock: "kb:wa:lock",
  waState: "kb:wa:state",
};
