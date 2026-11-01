import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useContextoTema } from "../disposiciones/contextoTema";
import { MODULOS_ESTUDIO } from "../datos/modulosEstudio";
import Insignia from "../componentes/Insignia";
import AnilloProgreso from "../componentes/estudio/AnilloProgreso";
import TarjetaModulo from "../componentes/estudio/TarjetaModulo";

/** Pantalla principal del tema: nombre, categoría, progreso y las cuatro tarjetas de módulos. Nada más. */
export default function PaginaTema() {
  const { tema } = useContextoTema();
  return (
    <section className="topic-home">
      <Link to="/temas" className="back-link">
        <ArrowLeft size={15} />
        Mis estudios
      </Link>

      <div className="topic-home-id">
        <div className="topic-home-text">
          <Insignia tono="blue">{tema.categoria}</Insignia>
          <h1>{tema.titulo}</h1>
          <p className="topic-home-progress">
            Progreso: <strong className="mono">{tema.dominio} %</strong>
          </p>
        </div>
        <AnilloProgreso valor={tema.dominio} />
      </div>

      <nav className="mod-grid stagger" aria-label="Módulos de estudio">
        {MODULOS_ESTUDIO.map((modulo) => (
          <TarjetaModulo key={modulo.id} modulo={modulo} idTema={tema.id} />
        ))}
      </nav>
    </section>
  );
}
