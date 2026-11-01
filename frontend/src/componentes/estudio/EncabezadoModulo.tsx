import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { ModuloEstudio } from "../../datos/modulosEstudio";
import type { TemaEstudio } from "../../tipos";
import SelectorModulos from "./SelectorModulos";

/** Encabezado común de los cuatro módulos: volver al tema, título del módulo y selector de nueve puntos. */
export default function EncabezadoModulo({ tema, modulo }: { tema: TemaEstudio; modulo: ModuloEstudio }) {
  const Icono = modulo.icono;
  return (
    <header className="topic-head mod-head" data-tono={modulo.tono}>
      <Link to={`/estudio/${tema.id}`} className="back-link" title="Volver a las opciones del tema">
        <ArrowLeft size={15} />
        <span className="mod-head-tema">{tema.titulo}</span>
      </Link>
      <div className="mod-head-row">
        <h1 className="mod-head-titulo">
          <span className="mod-head-icon" aria-hidden="true">
            <Icono size={20} strokeWidth={2} />
          </span>
          {modulo.etiqueta}
        </h1>
        <div className="mod-head-tools">
          <span className="mod-head-progress" title="Progreso del tema">
            <span className="mono">{tema.dominio} %</span>
            <span className="progress-track" aria-hidden="true">
              <span className="progress-fill" style={{ width: `${tema.dominio}%`, display: "block" }} />
            </span>
          </span>
          <SelectorModulos idTema={tema.id} actual={modulo.id} />
        </div>
      </div>
    </header>
  );
}
