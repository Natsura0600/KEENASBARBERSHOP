"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Work } from "@/lib/works";

const pad = (n: number) => String(n).padStart(2, "0");

export default function Works({ works }: { works: Work[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardVideos = useRef<(HTMLVideoElement | null)[]>([]);
  const visible = useRef<Set<number>>(new Set());
  const touchX = useRef<number | null>(null);
  const reduced = useRef(false);
  const [open, setOpen] = useState<number | null>(null);
  const openRef = useRef<number | null>(null);
  openRef.current = open;

  /* Reproduce solo los videos que se ven (y ninguno si el visor está abierto). */
  const sync = useCallback(() => {
    cardVideos.current.forEach((v, i) => {
      if (!v) return;
      const shouldPlay = !reduced.current && openRef.current === null && visible.current.has(i);
      if (shouldPlay && v.paused) v.play().catch(() => {});
      if (!shouldPlay && !v.paused) v.pause();
    });
  }, []);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.i);
          if (e.isIntersecting) visible.current.add(i);
          else visible.current.delete(i);
        }
        sync();
      },
      { threshold: 0.6 },
    );
    cardVideos.current.forEach((v) => v && io.observe(v));
    return () => io.disconnect();
  }, [sync]);

  /* Visor ampliado */
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
    document.documentElement.style.overflow = open !== null ? "hidden" : "";
    sync();
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open, sync]);

  const step = useCallback(
    (dir: 1 | -1) => setOpen((o) => (o === null ? o : (o + dir + works.length) % works.length)),
    [works.length],
  );

  const lbVideo = useCallback((v: HTMLVideoElement | null) => {
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {});
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const t = trackRef.current;
    if (t) t.scrollBy({ left: dir * Math.round(t.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <>
      <div className="works-head wrap reveal">
        <div className="sec-head" style={{ marginBottom: 0 }}>
          <div>
            <span className="eyebrow">Trabajos destacados</span>
            <h2 className="display">Así quedan</h2>
          </div>
          <p>Algunos de los trabajos de la barbería. Tocá uno para verlo en grande.</p>
        </div>
        <div className="works-arrows" aria-hidden>
          <button type="button" className="btn ghost sm" tabIndex={-1} onClick={() => scrollBy(-1)}>
            ←
          </button>
          <button type="button" className="btn ghost sm" tabIndex={-1} onClick={() => scrollBy(1)}>
            →
          </button>
        </div>
      </div>

      <ul className="works-track" ref={trackRef} aria-label="Trabajos destacados">
        {works.map((w, i) => (
          <li className="work" key={w.id}>
            <button
              type="button"
              className="work-card"
              onClick={() => setOpen(i)}
              aria-label={`Ver el trabajo ${i + 1} de ${works.length} en grande`}
            >
              <video
                ref={(el) => {
                  cardVideos.current[i] = el;
                }}
                data-i={i}
                src={w.src}
                poster={w.poster}
                muted
                loop
                playsInline
                preload="none"
                aria-hidden
                tabIndex={-1}
              />
              <span className="work-num" aria-hidden>
                {pad(i + 1)}
              </span>
              <span className="work-tag" aria-hidden>
                Ver
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        className="lb"
        aria-label="Trabajo ampliado"
        onClose={() => setOpen(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        <div
          className="lb-in"
          onClick={(e) => e.target === e.currentTarget && setOpen(null)}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
          }}
        >
          {open !== null && (
            <video
              key={works[open].id}
              ref={lbVideo}
              className="lb-video"
              src={works[open].src}
              poster={works[open].poster}
              loop
              muted
              playsInline
              autoPlay
              onClick={(e) => {
                const v = e.currentTarget;
                if (v.paused) v.play().catch(() => {});
                else v.pause();
              }}
            />
          )}
          <button type="button" className="lb-btn lb-close" onClick={() => setOpen(null)} aria-label="Cerrar">
            ✕
          </button>
          <button type="button" className="lb-btn lb-prev" onClick={() => step(-1)} aria-label="Trabajo anterior">
            ←
          </button>
          <button type="button" className="lb-btn lb-next" onClick={() => step(1)} aria-label="Trabajo siguiente">
            →
          </button>
          {open !== null && (
            <span className="lb-count">
              {pad(open + 1)} / {pad(works.length)}
            </span>
          )}
        </div>
      </dialog>
    </>
  );
}
