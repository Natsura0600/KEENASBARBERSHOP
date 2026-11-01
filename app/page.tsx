import Link from "next/link";
import LoyaltyCard from "@/components/LoyaltyCard";
import RevealObserver from "@/components/RevealObserver";
import SiteNav from "@/components/SiteNav";
import Works from "@/components/Works";
import { getLoyalty } from "@/lib/loyalty";
import { WORKS } from "@/lib/works";
import { getConfig, getNotices, getServices } from "@/lib/data";
import { DAYS_ES, nowAR } from "@/lib/dates";
import { ORDER, ars, mapsLink, openStatus, waLink } from "@/lib/format";

export const dynamic = "force-dynamic";

const REVIEWS = [
  { text: "Impecable.", who: "Francisco" },
  { text: "Muy recomendable. Hace muy bien su trabajo.", who: "Gabriel" },
  { text: "Puntual y muy profesional como siempre.", who: "Juan" },
];

const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function Home() {
  const [config, allServices, notices, loyalty] = await Promise.all([getConfig(), getServices(), getNotices(true), getLoyalty()]);
  const services = allServices.filter((s) => s.active);
  const now = nowAR();
  const status = openStatus(config, now);
  const todayIdx = new Date(`${now.date}T12:00:00Z`).getUTCDay();
  const openDays = Object.values(config.hours).filter(Boolean).length;

  const stampText = `${config.address} · ${config.city.split(",")[0]} · Turno a horario · `.toUpperCase();
  const marquee = ["Corte", "Barba", "Cejas", "Turno a horario", config.city.split(",")[0]];

  const prices = services.map((s) => s.price);
  const ld = {
    "@context": "https://schema.org",
    "@type": "BarberShop",
    name: config.name,
    description: config.tagline,
    address: {
      "@type": "PostalAddress",
      streetAddress: config.address,
      addressLocality: config.city.split(",")[0],
      addressRegion: "Buenos Aires",
      addressCountry: "AR",
    },
    geo: { "@type": "GeoCoordinates", latitude: config.lat, longitude: config.lng },
    telephone: config.whatsapp ? `+${config.whatsapp}` : undefined,
    priceRange: prices.length ? `${Math.min(...prices)}-${Math.max(...prices)} ARS` : undefined,
    openingHoursSpecification: Object.entries(config.hours)
      .filter(([, h]) => h)
      .map(([d, h]) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: EN_DAYS[Number(d)],
        opens: h!.open,
        closes: h!.close,
      })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <SiteNav config={config} />

      <main>
        {/* ---------------- HERO ---------------- */}
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <span className="eyebrow">Barbería · {config.city.split(",")[0]}</span>
              <h1>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="hero-logo" src="/img/logo.png" alt={config.name} width={760} height={503} />
              </h1>
              <p className="hero-sub">{config.tagline}</p>
              <div className="hero-cta">
                <Link href="/turnos" className="btn">
                  Reservar mi turno
                </Link>
                <span className={`status ${status.open ? "open" : ""}`}>
                  <i className="dot" />
                  {status.text}
                </span>
              </div>
            </div>
            <div className="stamp" aria-hidden>
              <svg viewBox="0 0 200 200">
                <defs>
                  <path id="ring" d="M100,100 m-76,0 a76,76 0 1,1 152,0 a76,76 0 1,1 -152,0" />
                </defs>
                <text>
                  <textPath href="#ring" textLength="470" lengthAdjust="spacing">
                    {stampText}
                  </textPath>
                </text>
                <circle className="core" cx="100" cy="100" r="36" />
                <path d="M84 116 L116 84 M84 84 L116 116" stroke="#0a0a0a" strokeWidth="5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </section>

        <div className="marquee" aria-hidden>
          <div className="marquee-track">
            {[...marquee, ...marquee, ...marquee, ...marquee].map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
        </div>

        {/* ---------------- AVISOS ---------------- */}
        {notices.length > 0 && (
          <section className="notices" aria-label="Avisos" style={{ padding: 0 }}>
            <div className="wrap notices-in">
              {notices.map((n) => (
                <div className="notice" key={n.id}>
                  <span className={`tag ${n.kind}`}>{n.kind === "importante" ? "Importante" : "Aviso"}</span>
                  <p style={{ margin: 0 }}>
                    {n.title && <b>{n.title}.</b>}
                    <span>{n.text}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------------- SERVICIOS ---------------- */}
        <section id="servicios">
          <div className="wrap">
            <div className="sec-head reveal">
              <div>
                <span className="eyebrow">Lista de precios</span>
                <h2 className="display">Servicios</h2>
              </div>
              <p>Todos incluyen la atención con turno a horario. Elegí el tuyo y reservá en un minuto.</p>
            </div>
            <ul className="menu">
              {services.map((s, i) => (
                <li key={s.id} className="reveal" style={{ ["--d" as string]: `${i * 0.06}s` }}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="name">
                    {s.name}
                    {s.onlyDays?.length ? (
                      <span className="chip">Solo {s.onlyDays.map((d) => DAYS_ES[d].toLowerCase()).join(" y ")}</span>
                    ) : null}
                  </span>
                  <span className="detail">{s.detail}</span>
                  <span className="meta">
                    <div className="price">{ars(s.price)}</div>
                    <div className="time">{s.duration} min</div>
                  </span>
                  <span className="go">
                    <Link href={`/turnos?servicio=${s.id}`} className="btn ghost sm">
                      Reservar
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- TRABAJOS DESTACADOS ---------------- */}
        <section id="trabajos" className="works-sec">
          <Works works={WORKS} />
        </section>

        {/* ---------------- FIDELIZACIÓN ---------------- */}
        {loyalty.enabled && (
          <section id="fidelizacion">
            <div className="wrap loyal">
              <div className="reveal">
                <span className="eyebrow">Para los que vuelven</span>
                <h2 className="display">Cada corte suma</h2>
                <p>
                  Con cada corte te llevás un sello. Al llegar a {loyalty.cutsRequired} ganás <b>{loyalty.rewardName}</b>
                  {loyalty.validDays > 0 ? ` (válido por ${loyalty.validDays} días)` : ""}. No tenés que bajar nada: tu tarjeta queda guardada con tu teléfono.
                </p>
                <Link className="btn ghost" href="/tarjeta">
                  Ver mi tarjeta
                </Link>
              </div>
              <div className="reveal" style={{ ["--d" as string]: "0.1s" }}>
                <LoyaltyCard stamps={Math.ceil(loyalty.cutsRequired / 2)} required={loyalty.cutsRequired} rewardName={loyalty.rewardName} note="Ejemplo de cómo se ve." />
              </div>
            </div>
          </section>
        )}

        {/* ---------------- CÓMO RESERVAR ---------------- */}
        <section id="como">
          <div className="wrap">
            <div className="sec-head reveal">
              <div>
                <span className="eyebrow">Sin llamadas ni vueltas</span>
                <h2 className="display">Cómo reservar</h2>
              </div>
            </div>
            <ol className="steps">
              {[
                ["Elegí qué te hacés", "Corte, barba, ceja o el combo completo. Ves el precio antes de seguir."],
                ["Agarrá tu horario", "Los días y horarios libres se muestran al instante. Lo que ves, está disponible."],
                ["Dejá tus datos y listo", "Nombre y teléfono. Te queda el turno confirmado en pantalla y lo sumás al calendario."],
              ].map(([t, d], i) => (
                <li key={t} className="reveal" style={{ ["--d" as string]: `${i * 0.1}s` }}>
                  <div className="big">{i + 1}</div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- EL BARBERO ---------------- */}
        <section id="barbero">
          <div className="wrap about">
            <div className="reveal">
              <span className="eyebrow">Quién atiende</span>
              <h2 className="display">{config.barber}</h2>
              <p>{config.about}</p>
              <p>
                Si venís por primera vez, contale qué estilo buscás y lo charlan en la silla.
              </p>
            </div>
            <div className="facts reveal" style={{ ["--d" as string]: "0.1s" }}>
              <div>
                <b>
                  5<em>,0</em>
                </b>
                <span>Puntaje</span>
              </div>
              <div>
                <b>19</b>
                <span>Reseñas de clientes</span>
              </div>
              <div>
                <b>
                  {config.slotMinutes}
                  <em>&apos;</em>
                </b>
                <span>Por turno</span>
              </div>
              <div>
                <b>{openDays}</b>
                <span>Días por semana</span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- RESEÑAS ---------------- */}
        <section style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="sec-head reveal">
              <div>
                <span className="eyebrow">Lo que dicen</span>
                <h2 className="display">Clientes</h2>
              </div>
            </div>
            <div className="reviews">
              {REVIEWS.map((r, i) => (
                <figure className="review reveal" key={r.who} style={{ margin: 0, ["--d" as string]: `${i * 0.1}s` }}>
                  <q>{r.text}</q>
                  <footer>— {r.who}</footer>
                </figure>
              ))}
            </div>
            <p className="review-note">Opiniones de clientes publicadas en el perfil de AgendaPro (5 de 5, 19 reseñas).</p>
          </div>
        </section>

        {/* ---------------- UBICACIÓN ---------------- */}
        <section id="ubicacion" className="steps-sec">
          <div className="wrap">
            <div className="sec-head reveal">
              <div>
                <span className="eyebrow">Dónde estamos</span>
                <h2 className="display">Ubicación</h2>
              </div>
            </div>
            <div className="place reveal">
              <div className="map">
                <iframe
                  title={`Mapa de ${config.name}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(`${config.address}, ${config.city}, Argentina`)}&z=16&output=embed`}
                />
              </div>
              <div className="place-info">
                <div className="address">
                  {config.address}
                  <small>{config.city}</small>
                </div>
                <ul className="hours">
                  {ORDER.map((d) => {
                    const h = config.hours[String(d)];
                    return (
                      <li key={d} className={d === todayIdx ? "today" : ""}>
                        <span>{DAYS_ES[d]}</span>
                        <span className={h ? "" : "closed"}>{h ? `${h.open} – ${h.close}` : "Cerrado"}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="actions">
                  <a className="btn" href={mapsLink(config)} target="_blank" rel="noopener noreferrer">
                    Cómo llegar
                  </a>
                  {config.whatsapp && (
                    <a
                      className="btn ghost"
                      href={waLink(config, `Hola! Quería hacer una consulta a ${config.name}.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section id="faq">
          <div className="wrap">
            <div className="sec-head reveal">
              <div>
                <span className="eyebrow">Antes de venir</span>
                <h2 className="display">Preguntas</h2>
              </div>
            </div>
            <div className="faq reveal">
              <details>
                <summary>¿Cómo reservo un turno?</summary>
                <p>
                  Entrás a Reservar turno, elegís servicio, día y horario, y dejás tu nombre y teléfono. Podés
                  reservar hasta {config.maxDaysAhead} días antes.
                </p>
              </details>
              <details>
                <summary>¿Puedo cambiar o cancelar?</summary>
                <p>{config.conditions}</p>
              </details>
              <details>
                <summary>¿Dónde queda?</summary>
                <p>
                  En {config.address}, {config.city}. Arriba tenés el mapa y el botón para abrir el recorrido en tu
                  celular.
                </p>
              </details>
              <details>
                <summary>¿Qué días y horarios atienden?</summary>
                <p>Están todos en la sección de ubicación. El horario de cada día cambia, así que mirá el de hoy resaltado.</p>
              </details>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="footer-logo" src="/img/logo.png" alt={config.name} width={760} height={503} loading="lazy" />
          <p>
            {config.address}, {config.city}
            <br />
            Sitio hecho por{" "}
            <a href="https://picturewebdev.vercel.app" target="_blank" rel="noopener noreferrer">
              Picture Web Dev
            </a>{" "}
            ·{" "}
            <Link href="/admin" style={{ borderBottom: 0 }}>
              Acceso
            </Link>
          </p>
        </div>
      </footer>

      <div className="sticky-cta">
        <Link href="/turnos" className="btn">
          Reservar turno
        </Link>
      </div>
      <RevealObserver />
    </>
  );
}
