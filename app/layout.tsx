import type { Metadata, Viewport } from "next";
import "@fontsource/big-shoulders-display/latin-700";
import "@fontsource/big-shoulders-display/latin-800";
import "@fontsource-variable/dm-sans";
import "./globals.css";

// Dominio para armar la URL de la imagen que se ve al compartir el link (WhatsApp, Instagram…).
// En Vercel se toma solo; si ponés un dominio propio, definí NEXT_PUBLIC_SITE_URL (ej: https://keenas.com.ar).
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Keena's Barbería · Luján",
    template: "%s · Keena's Barbería",
  },
  description:
    "Barbería en el centro de Luján, San Martín 984. Cortes, barba y cejas. Reservá tu turno online.",
  openGraph: {
    title: "Keena's Barbería · Luján",
    description: "Cortes, barba y cejas en San Martín 984, Luján. Reservá tu turno online.",
    locale: "es_AR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        {/* marca que hay JS para que las animaciones de scroll no oculten contenido si falla */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
