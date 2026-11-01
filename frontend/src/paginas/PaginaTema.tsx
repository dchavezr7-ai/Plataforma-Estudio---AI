import { Link } from "react-router-dom";
import { ArrowLeft, CalendarClock, ClipboardCheck, MessageCircleQuestion } from "lucide-react";
import { useContextoTema } from "../disposiciones/contextoTema";
import { MODULOS_ESTUDIO, type IdModulo } from "../datos/modulosEstudio";
import { etiquetasNivelDominio } from "../datos/temasEstudio";
import { obtenerResumenesEjemplo } from "../servicios/servicioResumen";
import { useSesion } from "../almacen/almacenSesion";
import Insignia from "../componentes/Insignia";
import AnilloProgreso from "../componentes/estudio/AnilloProgreso";
import TarjetaModulo, { type EstadoModulo } from "../componentes/estudio/TarjetaModulo";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Pantalla principal del tema: identificación, progreso real y las cuatro tarjetas de módulos. */
export default function PaginaTema() {
  const { tema } = useContextoTema();
  const resumenGenerado = useSesion((s) => s.resumenes[tema.id]);
  const mapaGenerado = useSesion((s) => s.mapas[tema.id]);

  // Todos los estados salen de datos reales del tema o de la sesión; nada se inventa.
  const estados: Record<IdModulo, EstadoModulo> = {
    resumen: resumenGenerado || obtenerResumenesEjemplo(tema.id) ? { texto: "Resumen listo", tipo: "listo" } : { texto: "Por generar", tipo: "pendiente" },
    preguntas: tema.preguntasRespondidas > 0 ? { texto: plural(tema.preguntasRespondidas, "respondida", "respondidas"), tipo: "listo" } : { texto: "Sin empezar", tipo: "pendiente" },
    prueba: tema.pruebasCompletadas > 0 ? { texto: plural(tema.pruebasCompletadas, "completada", "completadas"), tipo: "listo" } : { texto: "Sin intentos", tipo: "pendiente" },
    "mapa-mental": mapaGenerado ? { texto: "Mapa generado", tipo: "listo" } : { texto: "Disponible", tipo: "pendiente" },
  };

  return (
    <section className="topic-home">
      <Link to="/temas" className="back-link">
        <ArrowLeft size={15} />
        Mis estudios
      </Link>

      <div className="topic-hero" data-nivel={tema.nivelDominio}>
        <div className="topic-hero-text">
          <div className="topic-hero-tags">
            <Insignia tono="blue">{tema.categoria}</Insignia>
            <span className="topic-level">{etiquetasNivelDominio[tema.nivelDominio]}</span>
          </div>
          <h1>{tema.titulo}</h1>
          <p className="topic-home-progress">
            Progreso: <strong className="mono">{tema.dominio} %</strong>
          </p>
          <ul className="topic-facts" aria-label="Actividad en este tema">
            <li>
              <MessageCircleQuestion size={16} aria-hidden="true" />
              <strong className="mono">{tema.preguntasRespondidas}</strong> preguntas
            </li>
            <li>
              <ClipboardCheck size={16} aria-hidden="true" />
              <strong className="mono">{tema.pruebasCompletadas}</strong> pruebas
            </li>
            <li>
              <CalendarClock size={16} aria-hidden="true" />
              {tema.ultimoEstudioEn}
            </li>
          </ul>
        </div>
        <AnilloProgreso valor={tema.dominio} tamano={148} />
      </div>

      <div className="mod-section-title">
        <h2>¿Qué quieres hacer hoy?</h2>
        <span aria-hidden="true" />
      </div>
      <nav className="mod-grid stagger" aria-label="Módulos de estudio">
        {MODULOS_ESTUDIO.map((modulo, i) => (
          <TarjetaModulo key={modulo.id} modulo={modulo} idTema={tema.id} numero={i + 1} estado={estados[modulo.id]} />
        ))}
      </nav>
    </section>
  );
}
