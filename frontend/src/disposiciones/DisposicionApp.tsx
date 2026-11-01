import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import BarraLateral from "../componentes/BarraLateral";
import Encabezado from "../componentes/Encabezado";
import NavegacionInferior from "../componentes/NavegacionInferior";
import { useAutenticacion } from "../hooks/useAutenticacion";
import { useBarraLateral } from "../hooks/useBarraLateral";
import { guardarRutaPersistida } from "../almacen/persistenciaSesion";

export default function DisposicionApp() {
  const { estaAutenticado } = useAutenticacion();
  const [movilAbierto, establecerMovilAbierto] = useState(false);
  const ubicacion = useLocation();
  const { contraida } = useBarraLateral();

  useEffect(() => {
    establecerMovilAbierto(false);
  }, [ubicacion.pathname]);

  // La URL es la fuente de verdad de la navegación; se anota la última ruta para poder volver a ella.
  useEffect(() => {
    if (estaAutenticado) guardarRutaPersistida(`${ubicacion.pathname}${ubicacion.search}`);
  }, [estaAutenticado, ubicacion.pathname, ubicacion.search]);

  if (!estaAutenticado) {
    return <Navigate to="/iniciar-sesion" replace state={{ from: `${ubicacion.pathname}${ubicacion.search}` }} />;
  }

  // Las pantallas de un tema (resumen, preguntas, prueba, mapa) usan todo el ancho
  // disponible: el contenido de estudio es el protagonista.
  const coincidenciaEstudio = ubicacion.pathname.match(/^\/estudio\/([^/]+)(?:\/([^/]+))?/);
  const esEstudio = !!coincidenciaEstudio && coincidenciaEstudio[1] !== "nuevo";
  const esLienzo = esEstudio && coincidenciaEstudio?.[2] === "mapa-mental";
  // En un tema, el layout persiste al cambiar de pestaña (no se vuelve a cargar el tema).
  const claveTransicion = esEstudio ? `estudio-${coincidenciaEstudio![1]}` : ubicacion.pathname;

  return (
    <div className="app-shell" data-barra={contraida ? "contraida" : "expandida"}>
      <BarraLateral movilAbierto={movilAbierto} alCerrarMovil={() => establecerMovilAbierto(false)} />
      <div className="app-main">
        <Encabezado alAbrirMenuMovil={() => establecerMovilAbierto(true)} />
        <div className={`page-content page-transition ${esEstudio ? "wide" : ""} ${esLienzo ? "canvas" : ""}`} key={claveTransicion}>
          <Outlet />
        </div>
      </div>
      <NavegacionInferior />
    </div>
  );
}
