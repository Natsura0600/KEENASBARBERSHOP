import type { Config, Notice, Service } from "./types";

// Datos iniciales tomados del perfil público de Keena's Barbería (San Martín 984, Luján).
// Todo se puede cambiar después desde /admin; esto solo se usa mientras la base está vacía.

export const DEFAULT_CONFIG: Config = {
  name: "Keena's Barbería",
  tagline: "Corte, barba y cejas en el centro de Luján.",
  barber: "Francisco Keena",
  about:
    "Atiende Francisco, con turno a horario y trato cercano. Acá se viene a salir prolijo: cortes de precisión, cejas y arreglo de barba, en un local cómodo y sin vueltas.",
  address: "San Martín 984",
  city: "Luján, Buenos Aires",
  lat: -34.5676342,
  lng: -59.1081735,
  whatsapp: "5491151353287",
  instagram: "",
  slotMinutes: 40,
  maxDaysAhead: 21,
  conditions:
    "Los turnos se reservan por la web. Para cambiar o cancelar uno, escribinos por WhatsApp con tiempo. Si no podés venir, avisá así el horario lo toma otra persona.",
  hours: {
    "0": null,
    "1": { open: "10:10", close: "20:20" },
    "2": { open: "15:00", close: "20:20" },
    "3": { open: "10:10", close: "19:20" },
    "4": { open: "10:10", close: "20:20" },
    "5": { open: "10:10", close: "20:20" },
    "6": { open: "15:00", close: "20:20" },
  },
};

export const DEFAULT_SERVICES: Service[] = [
  {
    id: "corte",
    name: "Corte de pelo",
    detail: "Corte a tijera o máquina, terminación prolija.",
    price: 15000,
    duration: 40,
    active: true,
  },
  {
    id: "corte-ceja",
    name: "Corte + ceja",
    detail: "Corte completo con perfilado de cejas.",
    price: 17000,
    duration: 40,
    active: true,
  },
  {
    id: "corte-barba",
    name: "Corte + barba",
    detail: "Corte y arreglo de barba.",
    price: 20000,
    duration: 40,
    active: true,
  },
  {
    id: "completo",
    name: "Servicio completo",
    detail: "Corte, ceja y barba. El combo entero.",
    price: 22000,
    duration: 40,
    active: true,
  },
  {
    id: "2x1-lunes",
    name: "2x1 de los lunes",
    detail: "Dos cortes seguidos, para venir con un amigo. Solo lunes.",
    price: 15000,
    duration: 80,
    active: true,
    onlyDays: [1],
  },
];

export const DEFAULT_NOTICES: Notice[] = [
  {
    id: "n-lunes",
    title: "Lunes de 2x1",
    text: "Todos los lunes: dos cortes por $15.000. Reservá los dos turnos seguidos.",
    kind: "info",
    active: true,
  },
];
