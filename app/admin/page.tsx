import type { Metadata } from "next";
import Dashboard from "@/components/admin/Dashboard";
import Login from "@/components/admin/Login";
import { isAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/data";
import { nowAR } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false, follow: false },
  manifest: "/admin.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Keena's Panel", statusBarStyle: "black" },
};

export default async function AdminPage() {
  if (!(await isAdmin())) return <Login />;
  const config = await getConfig();
  return <Dashboard today={nowAR().date} shopName={config.name} />;
}
