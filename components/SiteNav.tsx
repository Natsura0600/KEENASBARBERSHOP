import Link from "next/link";
import type { Config } from "@/lib/types";

export default function SiteNav({ config, minimal = false }: { config: Config; minimal?: boolean }) {
  return (
    <header className="nav">
      <div className="pole" aria-hidden />
      <div className="wrap nav-in">
        <Link href="/" className="brand" aria-label={`${config.name}, inicio`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/img/logo.png" alt="" width={760} height={503} />
        </Link>
        {!minimal && (
          <nav className="nav-links" aria-label="Secciones">
            <a href="/#servicios">Servicios</a>
            <a href="/#trabajos">Trabajos</a>
            <a href="/#como">Cómo reservar</a>
            <a href="/#ubicacion">Dónde estamos</a>
          </nav>
        )}
        {minimal ? (
          <Link href="/" className="btn ghost sm">
            ← Volver
          </Link>
        ) : (
          <Link href="/turnos" className="btn sm">
            Reservar turno
          </Link>
        )}
      </div>
    </header>
  );
}
