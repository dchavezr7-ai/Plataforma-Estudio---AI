interface Props {
  valor: number;
  tamano?: number;
}

/** Indicador circular de progreso (valor 0–100). */
export default function AnilloProgreso({ valor, tamano = 112 }: Props) {
  const v = Math.max(0, Math.min(100, Math.round(valor)));
  const grosor = 10;
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  return (
    <div className="ring" style={{ width: tamano, height: tamano }} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del tema">
      <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} aria-hidden="true">
        <defs>
          <linearGradient id="cursa-anillo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary-solid)" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>
        <circle className="ring-pista" cx={tamano / 2} cy={tamano / 2} r={radio} strokeWidth={grosor} fill="none" />
        <circle
          className="ring-valor"
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          strokeWidth={grosor}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia * (1 - v / 100)}
          transform={`rotate(-90 ${tamano / 2} ${tamano / 2})`}
        />
      </svg>
      <span className="ring-cifra mono">{v}%</span>
    </div>
  );
}
