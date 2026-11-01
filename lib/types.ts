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
