import { useSesion } from "../../almacen/almacenSesion";
import { NIVELES, calcularRendimiento, unirRespuestas } from "../../utilidades/rendimiento";
import { etiquetaDificultad } from "../../utilidades/formato";

const porcentaje = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** MOD-08 · TASK-0082: variables de rendimiento calculadas solo con las respuestas registradas (práctica y pruebas). */
export default function RendimientoSesion() {
  const registros = useSesion((s) => s.rendimiento);
  const r = calcularRendimiento(unirRespuestas(Object.values(registros)));

  if (r.total === 0) return <p className="session-note">Aún no hay respuestas registradas.</p>;

  return (
    <>
      <p className="session-note">
        <strong>Tu rendimiento</strong> · {r.total} {r.total === 1 ? "respuesta" : "respuestas"}
        {r.tiempoMedioSegundos !== null && ` · ${Math.round(r.tiempoMedioSegundos)} s por pregunta en práctica`}
      </p>
      <dl className="session-figures" aria-label="Rendimiento general">
        <div>
          <dt>Aciertos</dt>
          <dd>{porcentaje(r.porcentajeAcumulado)}</dd>
        </div>
        <div>
          <dt>Racha</dt>
          <dd>{r.rachaActual}</dd>
        </div>
        <div>
          <dt>Mejor racha</dt>
          <dd>{r.mejorRacha}</dd>
        </div>
      </dl>
      <dl className="session-figures" aria-label="Aciertos por dificultad">
        {NIVELES.map((nivel) => (
          <div key={nivel}>
            <dt>{etiquetaDificultad(nivel)}</dt>
            <dd>
              {r.porDificultad[nivel].correctas}/{r.porDificultad[nivel].preguntas}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
