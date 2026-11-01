import type { Metadata } from "next";
import BookingForm from "@/components/BookingForm";
import SiteNav from "@/components/SiteNav";
import { getConfig, getServices } from "@/lib/data";
import { nowAR } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reservar turno" };

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ servicio?: string }>;
}) {
  const [{ servicio }, config, services] = await Promise.all([searchParams, getConfig(), getServices()]);
  const active = services.filter((s) => s.active);

  return (
    <>
      <SiteNav config={config} minimal />
      <main className="wrap">
        <BookingForm
          services={active}
          hours={config.hours}
          maxDaysAhead={config.maxDaysAhead}
          today={nowAR().date}
          initialServiceId={active.find((s) => s.id === servicio)?.id}
          shop={{
            name: config.name,
            address: `${config.address}, ${config.city}`,
            whatsapp: config.whatsapp,
            conditions: config.conditions,
          }}
        />
      </main>
    </>
  );
}
