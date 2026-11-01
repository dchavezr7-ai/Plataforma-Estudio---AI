import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { ModuloEstudio } from "../../datos/modulosEstudio";

/** Acceso a un módulo desde la pantalla principal del tema. */
export default function TarjetaModulo({ modulo, idTema }: { modulo: ModuloEstudio; idTema: string }) {
  const Icono = modulo.icono;
  return (
    <Link to={`/estudio/${idTema}/${modulo.ruta}`} className="mod-card" data-tono={modulo.tono}>
      <span className="mod-card-icon" aria-hidden="true">
        <Icono size={26} strokeWidth={1.9} />
      </span>
      <span className="mod-card-text">
        <strong>{modulo.etiqueta}</strong>
        <small>{modulo.proposito}</small>
      </span>
      <span className="mod-card-go" aria-hidden="true">
        <ArrowUpRight size={18} />
      </span>
    </Link>
  );
}
