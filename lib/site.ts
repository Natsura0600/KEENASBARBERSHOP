import { configFrom, noticesFrom, servicesFrom, visibleNotices } from "./data";
import { getStoreOrNull, keys } from "./db";
import { DEFAULT_CONFIG, DEFAULT_LOYALTY, DEFAULT_NOTICES, DEFAULT_SERVICES } from "./defaults";
import { mergeLoyalty } from "./loyalty";
import type { Config, LoyaltyConfig, Notice, Service } from "./types";

/**
 * Todo lo que la web pública necesita para dibujarse (config, servicios, avisos y tarjeta),
 * leído con UN solo comando a Redis en vez de cuatro.
 *
 * Con `fresh: false` además se guarda unos segundos en la memoria de la instancia, para que una
 * ráfaga de visitas (o un bot) no pegue a la base en cada una. Después de guardar algo en el panel
 * la web pública lo muestra en, como mucho, 15 segundos (cada página corre en su propia instancia).
 */
export type Site = { config: Config; services: Service[]; notices: Notice[]; visibleNotices: Notice[]; loyalty: LoyaltyConfig };

const TTL_MS = 15_000;
let cache: { at: number; site: Site } | null = null;

export function invalidateSite() {
  cache = null;
}

const defaults = (): Site => ({
  config: DEFAULT_CONFIG,
  services: DEFAULT_SERVICES,
  notices: DEFAULT_NOTICES,
  visibleNotices: visibleNotices(DEFAULT_NOTICES),
  loyalty: DEFAULT_LOYALTY,
});

export async function getSite(opts: { fresh?: boolean } = {}): Promise<Site> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.site;
  const db = getStoreOrNull();
  if (!db) return defaults();
  try {
    const [c, s, n, l] = await db.mget([keys.config, keys.services, keys.notices, keys.loyalty]);
    const notices = noticesFrom(n);
    const site: Site = {
      config: configFrom(c as Partial<Config> | null),
      services: servicesFrom(s),
      notices,
      visibleNotices: visibleNotices(notices),
      loyalty: mergeLoyalty(l as Partial<LoyaltyConfig> | null),
    };
    cache = { at: Date.now(), site };
    return site;
  } catch {
    return defaults();
  }
}
