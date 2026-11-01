import type { Metadata } from "next";
import CardLookup from "@/components/CardLookup";
import SiteNav from "@/components/SiteNav";
import { getConfig } from "@/lib/data";
import { getLoyalty } from "@/lib/loyalty";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tarjeta de fidelización" };

export default async function TarjetaPage() {
  const [config, loyalty] = await Promise.all([getConfig(), getLoyalty()]);
  return (
    <>
      <SiteNav config={config} minimal />
      <main className="wrap">
        <div className="page-head">
          <span className="eyebrow">Fidelización</span>
          <h1 className="display">Tu tarjeta de sellos</h1>
          {loyalty.enabled ? (
            <p>
              Cada corte suma un sello. Con {loyalty.cutsRequired} sellos ganás <b>{loyalty.rewardName}</b>
              {loyalty.validDays > 0 ? ` (vale ${loyalty.validDays} días desde que lo ganás)` : ""}. Ingresá tu teléfono para ver cuántos llevás.
            </p>
          ) : (
            <p>La tarjeta de fidelización no está activa por ahora.</p>
          )}
        </div>
        {loyalty.enabled && (
          <div className="lookup-wrap">
            <CardLookup />
            <details className="lcard-how">
              <summary>Cómo funciona</summary>
              <p>
                Los sellos se cargan cuando se cobra el turno. Si aceptás recibir avisos por WhatsApp, te escribimos cuando completás la tarjeta. Los premios se canjean en el local mostrando el código.
              </p>
            </details>
          </div>
        )}
      </main>
    </>
  );
}
