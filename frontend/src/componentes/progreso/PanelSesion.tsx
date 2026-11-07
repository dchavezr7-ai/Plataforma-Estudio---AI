import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useSesion } from "../../almacen/almacenSesion";
import { formatearTiempoRelativo } from "../../utilidades/formato";
import ListaActividad from "../ListaActividad";
import RendimientoSesion from "./RendimientoSesion";

function useAhora(intervaloMs: number) {
  const [ahora, establecerAhora] = useState(() => Date.now());
  useEffect(() => {
    const temporizador = window.setInterval(() => establecerAhora(Date.now()), intervaloMs);
    return () => window.clearInterval(temporizador);
  }, [intervaloMs]);
  return ahora;
}

/** Actividad real de esta sesión (memoria). No inventa datos: si no hay, lo dice. */
export default function PanelSesion() {
  const actividad = useSesion((s) => s.actividad);
  const iniciadoEn = useSesion((s) => s.iniciadoEn);
  const ahora = useAhora(30_000);

  const cantidad = (tipo: string) => actividad.filter((a) => a.tipo === tipo).length;
  const minutos = Math.max(0, Math.floor((ahora - iniciadoEn) / 60_000));
  const cifras = [
    { etiqueta: "Resúmenes", valor: cantidad("resumen") },
    { etiqueta: "Temas nuevos", valor: cantidad("tema-creado") },
    { etiqueta: "Pruebas", valor: cantidad("prueba") },
  ];

  return (
    <section className="session-panel" aria-labelledby="session-title">
      <div className="session-panel-head">
        <h2 id="session-title">Esta sesión</h2>
        <span className="session-clock">{minutos < 1 ? "Recién empieza" : `${minutos} min estudiando`}</span>
      </div>

      {actividad.length === 0 ? (
        <div className="session-empty">
          <span className="session-empty-icon" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <p className="session-empty-title">Aún no hay actividad en esta sesión</p>
          <p>Genera un resumen o completa una prueba y aquí verás cómo avanzas hoy.</p>
          <Link to="/temas" className="btn btn-secondary btn-sm">
            Elegir un tema
          </Link>
        </div>
      ) : (
        <>
          <dl className="session-figures">
            {cifras.map((f) => (
              <div key={f.etiqueta}>
                <dt>{f.etiqueta}</dt>
                <dd className="num-pop" key={f.valor}>
                  {f.valor}
                </dd>
              </div>
            ))}
          </dl>
          <ListaActividad
            elementos={actividad.slice(0, 6).map((a) => ({ ...a, tiempo: formatearTiempoRelativo(a.at, ahora) }))}
          />
        </>
      )}
      <RendimientoSesion />
      <p className="session-note">Tu progreso es temporal: se conserva si recargas la página, pero se borra al cerrar la pestaña o cerrar sesión. No se guarda en ningún servidor.</p>
    </section>
  );
}
