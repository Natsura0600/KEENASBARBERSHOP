import type { TemplateVar } from "./types";

// Parte "pura" de la fidelización: la usan tanto el servidor como el panel del navegador.

export const TEMPLATE_VARS: TemplateVar[] = ["nombre", "premio", "codigo", "vencimiento", "negocio", "sellos"];

export const VAR_LABELS: Record<TemplateVar, string> = {
  nombre: "Nombre del cliente",
  premio: "Premio",
  codigo: "Código del premio",
  vencimiento: "Vencimiento",
  negocio: "Nombre del negocio",
  sellos: "Cantidad de sellos de la tarjeta",
};

/** Texto para copiar al crear la plantilla en Meta, según el orden de variables elegido. */
export function suggestedTemplateText(vars: TemplateVar[]): string {
  const at = (v: TemplateVar) => {
    const i = vars.indexOf(v);
    return i >= 0 ? `{{${i + 1}}}` : null;
  };
  const nombre = at("nombre");
  const negocio = at("negocio");
  const premio = at("premio");
  const codigo = at("codigo");
  const venc = at("vencimiento");
  const sellos = at("sellos");
  return [
    `Hola${nombre ? ` ${nombre}` : ""}!`,
    `Completaste tu tarjeta de fidelización${negocio ? ` de ${negocio}` : ""}${sellos ? ` (${sellos} sellos)` : ""}${premio ? ` y ganaste: ${premio}` : ""}.`,
    codigo ? `Tu código es ${codigo}.` : "",
    venc ? `Vencimiento: ${venc}.` : "",
    "Mostralo en tu próximo turno.",
  ]
    .filter(Boolean)
    .join(" ");
}

