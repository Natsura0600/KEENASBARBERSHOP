export type DayHours = { open: string; close: string } | null;

export type Config = {
  name: string;
  tagline: string;
  barber: string;
  about: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  whatsapp: string; // solo dígitos con código de país, ej: 5491151353287
  instagram: string; // usuario sin @ (vacío si no hay)
  slotMinutes: number;
  maxDaysAhead: number;
  conditions: string;
  hours: Record<string, DayHours>; // "0" domingo ... "6" sábado
};

export type Service = {
  id: string;
  name: string;
  detail: string;
  price: number;
  duration: number; // minutos
  active: boolean;
  onlyDays?: number[]; // 0-6; si existe, solo se reserva esos días
};

export type Notice = {
  id: string;
  title: string;
  text: string;
  kind: "info" | "importante";
  active: boolean;
  expiresOn?: string; // YYYY-MM-DD, opcional
};

export type AppointmentStatus = "reserved" | "done" | "cancelled" | "noshow";

export type Appointment = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  slots: string[]; // horarios ocupados
  serviceId: string;
  serviceName: string;
  price: number;
  duration: number;
  name: string;
  phone: string;
  status: AppointmentStatus;
  source: "web" | "admin";
  createdAt: string;
  /** Lo que este turno aportó a la tarjeta de fidelización (para poder deshacerlo). */
  loyalty?: { stamps: number; rewards: string[]; redeemed?: string };
};

export type PayMethod = "efectivo" | "transferencia" | "otro";

export type CashEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  type: "ingreso" | "egreso";
  amount: number;
  method: PayMethod;
  concept: string;
  appointmentId?: string;
};

/* ---------------- Fidelización ---------------- */

export type TemplateVar = "nombre" | "premio" | "codigo" | "vencimiento" | "negocio" | "sellos";

export type Milestone = { at: number; name: string; percent: number }; // percent 0 = premio sin descuento automático

export type LoyaltyConfig = {
  enabled: boolean;
  cutsRequired: number; // sellos para completar la tarjeta
  rewardName: string; // premio al completar la tarjeta, ej. "1 corte gratis"
  milestones: Milestone[]; // premios intermedios (ej. a los 5 sellos, 15% de descuento)
  validDays: number; // días de vigencia del premio (0 = no vence)
  stamps: Record<string, number>; // serviceId -> sellos que suma (si falta, 1; 0 = no suma)
  channel: "baileys" | "api"; // baileys = número vinculado con QR; api = API oficial de Meta (con plantilla)
  autoSend: boolean; // avisar solo al completar la tarjeta
  template: { name: string; language: string; vars: TemplateVar[] };
  manualMessage: string; // mensaje del botón "Avisar por WhatsApp" (con {nombre}, {premio}…)
};

export type Client = {
  phone: string; // canónico: 549 + 10 dígitos
  name: string;
  stamps: number; // progreso actual de la tarjeta
  total: number; // sellos históricos
  earned: number; // premios ganados
  optIn: boolean; // aceptó recibir avisos por WhatsApp
  optInAt?: string;
  optInSource?: "web" | "admin";
  lastVisit?: string; // YYYY-MM-DD
  createdAt: string;
};

export type RewardStatus = "pending" | "redeemed" | "cancelled";

export type Reward = {
  percent?: number; // premio de descuento (15 = 15% off)
  milestone?: number; // si es un premio intermedio: en qué sello se ganó
  code: string; // XXX-XXX
  phone: string;
  name: string;
  reward: string; // texto del premio al momento de ganarlo
  createdAt: string;
  expiresOn?: string;
  status: RewardStatus;
  redeemedAt?: string;
  redeemedApptId?: string;
  fromApptId?: string;
  send?: { via: "whatsapp" | "baileys" | "simulated" | "manual"; at: string; ok: boolean; error?: string; wamid?: string };
};
