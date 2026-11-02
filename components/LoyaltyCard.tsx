import type { Milestone } from "@/lib/types";

/** Tarjeta de sellos. Sirve para la web, la confirmación del turno y la consulta por teléfono. */
export default function LoyaltyCard({
  stamps,
  required,
  rewardName,
  milestones = [],
  pendingNames = [],
  note,
}: {
  stamps: number;
  required: number;
  rewardName: string;
  milestones?: Milestone[];
  pendingNames?: string[];
  note?: string;
}) {
  const filled = Math.min(stamps, required);
  const ms = new Map(milestones.filter((m) => m.at < required).map((m) => [m.at, m]));
  const next = [...ms.values(), { at: required, name: rewardName, percent: 0 }].filter((m) => m.at > filled).sort((a, b) => a.at - b.at)[0];
  const left = next ? next.at - filled : 0;
  const grouped = Object.entries(pendingNames.reduce<Record<string, number>>((acc, n) => ({ ...acc, [n]: (acc[n] ?? 0) + 1 }), {})).map(([n, c]) => (c > 1 ? `${n} ×${c}` : n));

  return (
    <div className="lcard" role="group" aria-label={`Tarjeta de fidelización: ${filled} de ${required} sellos`}>
      <div className="lcard-top">
        <span className="eyebrow">Tarjeta de fidelización</span>
        <b className="lcard-count">
          {filled}/{required}
        </b>
      </div>
      <ol className="lcard-grid" style={{ ["--cols" as string]: required > 10 ? 7 : 5 }}>
        {Array.from({ length: required }).map((_, i) => {
          const n = i + 1;
          const m = ms.get(n);
          const last = n === required;
          const on = n <= filled;
          return (
            <li key={n} className={`${on ? "on" : ""} ${m || last ? "ms" : ""}`} style={{ ["--i" as string]: i }} title={m ? m.name : last ? rewardName : undefined}>
              <span>{on ? "" : m ? (m.percent > 0 ? `${m.percent}%` : "★") : last ? "★" : n}</span>
            </li>
          );
        })}
      </ol>
      <p className="lcard-foot">
        {pendingNames.length > 0 ? (
          <>
            <b>Tenés {pendingNames.length === 1 ? "un premio" : `${pendingNames.length} premios`} para canjear:</b> {grouped.join(", ")}. Mostralo en tu próximo turno.
          </>
        ) : next ? (
          <>
            {left === 1 ? "Te falta 1 sello" : `Te faltan ${left} sellos`} para ganar <b>{next.name}</b>.
          </>
        ) : (
          <>Tarjeta completa. Premio: {rewardName}.</>
        )}
      </p>
      {note && <p className="lcard-note">{note}</p>}
    </div>
  );
}
