import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MODULOS_ESTUDIO, type IdModulo } from "../../datos/modulosEstudio";
import { useClicFuera } from "../../hooks/useClicFuera";

function IconoNuevePuntos() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      {[3, 10, 17].flatMap((x) => [3, 10, 17].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" />))}
    </svg>
  );
}

/**
 * Menú contextual de nueve puntos (estilo menú de aplicaciones): cambia entre los cuatro módulos
 * del tema actual sin pasar por la pantalla principal. No es un modal ni un control global.
 */
export default function SelectorModulos({ idTema, actual }: { idTema: string; actual: IdModulo }) {
  const [abierto, establecerAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClicFuera(ref as React.RefObject<HTMLElement>, () => establecerAbierto(false), abierto);

  return (
    <div className="mod-switch" ref={ref}>
      <button type="button" className="mod-switch-btn" aria-haspopup="menu" aria-expanded={abierto} aria-label="Cambiar de módulo" title="Cambiar de módulo" onClick={() => establecerAbierto((o) => !o)}>
        <IconoNuevePuntos />
      </button>
      {abierto && (
        <div className="mod-switch-menu" role="menu" aria-label="Módulos del tema">
          {MODULOS_ESTUDIO.map(({ id, ruta, etiqueta, icono: Icono, tono }) => (
            <Link key={id} role="menuitem" to={`/estudio/${idTema}/${ruta}`} className="mod-switch-item" data-tono={tono} aria-current={id === actual ? "page" : undefined} onClick={() => establecerAbierto(false)}>
              <span className="mod-switch-icon" aria-hidden="true">
                <Icono size={22} strokeWidth={1.9} />
              </span>
              <span>{etiqueta}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
