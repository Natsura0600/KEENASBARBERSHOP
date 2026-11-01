import { DAYS_ES, dow, toMin } from "./dates";
import type { Config } from "./types";

export const ars = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

export const ORDER = [1, 2, 3, 4, 5, 6, 0]; // lunes a domingo

export function openStatus(config: Config, now: { date: string; minutes: number }) {
  const d = dow(now.date);
  const h = config.hours[String(d)];
  if (h && now.minutes >= toMin(h.open) && now.minutes < toMin(h.close)) {
    return { open: true, text: `Abierto hasta las ${h.close}` };
  }
  if (h && now.minutes < toMin(h.open)) return { open: false, text: `Abre hoy a las ${h.open}` };
  for (let i = 1; i <= 7; i++) {
    const nd = (d + i) % 7;
    const nh = config.hours[String(nd)];
    if (nh) {
      return {
        open: false,
        text: i === 1 ? `Abre mañana a las ${nh.open}` : `Abre el ${DAYS_ES[nd].toLowerCase()} a las ${nh.open}`,
      };
    }
  }
  return { open: false, text: "Cerrado por ahora" };
}

export function waLink(config: Config, text: string) {
  return `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(text)}`;
}

export function mapsLink(config: Config) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${config.address}, ${config.city}`)}`;
}
