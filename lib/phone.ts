// Teléfonos argentinos. Todo se guarda en formato canónico de celular: "549" + 10 dígitos
// (código de área sin 0 + número sin el 15). Así el mismo cliente se reconoce
// aunque escriba "11 5555-1234", "011 15 5555 1234" o "+54 9 11 5555 1234".

export function normalizePhone(input: string | undefined | null): string | null {
  let d = String(input ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);

  // área + 15 + abonado (12 dígitos): se saca el 15
  if (d.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (d.slice(areaLen, areaLen + 2) === "15") {
        d = d.slice(0, areaLen) + d.slice(areaLen + 2);
        break;
      }
    }
  }
  if (d.length !== 10) return null;
  // Ningún código de área argentino empieza con 15: es un número local sin área ("15 5555 1234").
  if (d.startsWith("15")) return null;
  return `549${d}`;
}

/** Número con el formato que espera la API de WhatsApp. */
export function toWhatsApp(canonical: string, format: "with9" | "without9" = "with9"): string {
  return format === "without9" && canonical.startsWith("549") ? `54${canonical.slice(3)}` : canonical;
}

/** Para mostrar: 11 5555-1234 */
export function prettyPhone(canonical: string): string {
  const n = canonical.startsWith("549") ? canonical.slice(3) : canonical;
  if (n.length !== 10) return canonical;
  const area = n.startsWith("11") ? 2 : n.startsWith("2") || n.startsWith("3") ? 4 : 3;
  const rest = n.slice(area);
  return `${n.slice(0, area)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
}
