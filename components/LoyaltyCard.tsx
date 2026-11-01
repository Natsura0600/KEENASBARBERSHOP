/** Tarjeta de sellos. Sirve para la web, la confirmación del turno y la consulta por teléfono. */
export default function LoyaltyCard({
  stamps,
  required,
  rewardName,
  pending = 0,
  note,
}: {
  stamps: number;
  required: number;
  rewardName: string;
  pending?: number;
  note?: string;
}) {
  const filled = Math.min(stamps, required);
  const left = Math.max(required - filled, 0);
  return (
    <div className="lcard" role="group" aria-label={`Tarjeta de fidelización: ${filled} de ${required} sellos`}>
      <div className="lcard-top">
        <span className="eyebrow">Tarjeta de fidelización</span>
        <b className="lcard-count">
          {filled}/{required}
        </b>
      </div>
      <ol className="lcard-grid" style={{ ["--cols" as string]: required > 10 ? 7 : 5 }}>
        {Array.from({ length: required }).map((_, i) => (
          <li key={i} className={i < filled ? "on" : ""} style={{ ["--i" as string]: i }}>
            <span>{i < filled ? "" : i + 1}</span>
          </li>
        ))}
      </ol>
      <p className="lcard-foot">
        {pending > 0 ? (
          <>
            <b>Tenés {pending} premio{pending > 1 ? "s" : ""} para canjear:</b> {rewardName}. Mostralo en tu próximo turno.
          </>
        ) : left === 0 ? (
          <>Tarjeta completa. Premio: {rewardName}.</>
        ) : (
          <>
            {left === 1 ? "Te falta 1 sello" : `Te faltan ${left} sellos`} para ganar <b>{rewardName}</b>.
          </>
        )}
      </p>
      {note && <p className="lcard-note">{note}</p>}
    </div>
  );
}
