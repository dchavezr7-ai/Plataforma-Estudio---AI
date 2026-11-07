import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import type { PreguntaEstudio } from "../tipos";
import { useContextoTema } from "../disposiciones/contextoTema";
import * as studyService from "../servicios/servicioEstudio";
import { registrarRespuestas } from "../almacen/almacenSesion";
import { segundosEntre } from "../utilidades/rendimiento";
import PreguntaPractica from "./PreguntaPractica";
import MedidorDominio from "./MedidorDominio";
import Boton from "./Boton";

interface Props {
  preguntas: PreguntaEstudio[];
  /** Notifica cada respuesta para registrar el estado de la pregunta. */
  alResponder: (idPregunta: string, esCorrecta: boolean) => void;
  alSalir: () => void;
}

/**
 * Práctica guiada (comportamiento original): una pregunta a la vez, con
 * retroalimentación inmediata y actualización del indicador de dominio.
 */
export default function SesionPractica({ preguntas, alResponder, alSalir }: Props) {
  const { tema, establecerTema } = useContextoTema();
  const [indiceActual, establecerIndiceActual] = useState(0);
  const [correcta, establecerCorrecta] = useState(0);
  const [incorrecta, establecerIncorrecta] = useState(0);
  const [terminada, establecerTerminada] = useState(false);
  const [ronda, establecerRonda] = useState(0);
  /** MOD-08: instante en que se mostró la pregunta actual (tiempo por pregunta). */
  const inicioPregunta = useRef(Date.now());

  function manejarRespondida(idPregunta: string, esCorrecta: boolean) {
    if (esCorrecta) establecerCorrecta((c) => c + 1);
    else establecerIncorrecta((c) => c + 1);
    const pregunta = preguntas.find((p) => p.id === idPregunta);
    if (pregunta) registrarRespuestas(tema.id, [{ dificultad: pregunta.dificultad, correcta: esCorrecta, segundos: segundosEntre(inicioPregunta.current, Date.now()), origen: "practica" }]);
    alResponder(idPregunta, esCorrecta);
  }

  async function manejarSiguiente() {
    if (indiceActual + 1 >= preguntas.length) {
      establecerTerminada(true);
      const respondida = correcta + incorrecta;
      const puntajeSesion = respondida > 0 ? Math.round((correcta / respondida) * 100) : tema.dominio;
      // Combina el dominio previo con el resultado de esta práctica para una transición suave.
      const mezclado = Math.min(100, Math.round(tema.dominio * 0.4 + puntajeSesion * 0.6));
      const actualizado = await studyService.actualizarDominioTema(tema.id, mezclado);
      await studyService.incrementarPreguntasRespondidas(tema.id, preguntas.length);
      if (actualizado) establecerTema(actualizado);
    } else {
      inicioPregunta.current = Date.now();
      establecerIndiceActual((i) => i + 1);
    }
  }

  function reiniciar() {
    establecerIndiceActual(0);
    establecerCorrecta(0);
    establecerIncorrecta(0);
    establecerTerminada(false);
    inicioPregunta.current = Date.now();
    establecerRonda((r) => r + 1);
  }

  if (terminada) {
    const total = correcta + incorrecta;
    const porcentaje = total > 0 ? Math.round((correcta / total) * 100) : 0;
    return (
      <div className="practice-done">
        <MedidorDominio valor={porcentaje} etiqueta="Aciertos" tamano={150} />
        <h2>Práctica completada</h2>
        <p className="text-muted">
          Respondiste correctamente {correcta} de {total} preguntas.
        </p>
        <div className="results-actions">
          <Boton variante="secondary" onClick={reiniciar}>
            <RotateCcw size={15} />
            Practicar de nuevo
          </Boton>
          <Boton variante="secondary" onClick={alSalir}>
            Volver a la lista
          </Boton>
          <Link to={`/estudio/${tema.id}/prueba`} className="btn btn-primary">
            Ir a la prueba
          </Link>
        </div>
      </div>
    );
  }

  const actual = preguntas[indiceActual];
  const porcentajeProgreso = Math.round((indiceActual / preguntas.length) * 100);

  return (
    <div className="practice">
      <div className="practice-top">
        <div className="progress-track" role="progressbar" aria-valuenow={porcentajeProgreso} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${porcentajeProgreso}%` }} />
        </div>
        <div className="practice-tally">
          <span className="text-muted">
            Correctas: <strong style={{ color: "var(--color-success)" }}>{correcta}</strong>
          </span>
          <span className="text-muted">
            Incorrectas: <strong style={{ color: "var(--color-danger)" }}>{incorrecta}</strong>
          </span>
        </div>
      </div>

      <PreguntaPractica
        key={`${ronda}-${actual.id}`}
        pregunta={actual}
        indice={indiceActual}
        total={preguntas.length}
        alResponder={(ok) => manejarRespondida(actual.id, ok)}
        alSiguiente={manejarSiguiente}
        esUltima={indiceActual + 1 >= preguntas.length}
      />
    </div>
  );
}
