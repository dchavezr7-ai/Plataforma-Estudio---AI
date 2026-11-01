import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { leerRutaPersistida } from "./almacen/persistenciaSesion";
import DisposicionApp from "./disposiciones/DisposicionApp";
import DisposicionTema from "./disposiciones/DisposicionTema";
import { EstadoCarga } from "./componentes/Estados";

import PaginaInicioSesion from "./paginas/PaginaInicioSesion";
import PaginaPanel from "./paginas/PaginaPanel";
import PaginaTema from "./paginas/PaginaTema";
import PaginaNoEncontrada from "./paginas/PaginaNoEncontrada";

// Pantallas que arrastran librerías pesadas (gráficos, React Flow) se cargan bajo demanda.
const PaginaListaTemas = lazy(() => import("./paginas/PaginaListaTemas"));
const PaginaNuevoTema = lazy(() => import("./paginas/PaginaNuevoTema"));
const PaginaResumen = lazy(() => import("./paginas/PaginaResumen"));
const PaginaPreguntas = lazy(() => import("./paginas/PaginaPreguntas"));
const PaginaPrueba = lazy(() => import("./paginas/PaginaPrueba"));
const PaginaResultados = lazy(() => import("./paginas/PaginaResultados"));
const PaginaMapaMental = lazy(() => import("./paginas/PaginaMapaMental"));
const PaginaProgreso = lazy(() => import("./paginas/PaginaProgreso"));
const PaginaPerfil = lazy(() => import("./paginas/PaginaPerfil"));
const PaginaConfiguracion = lazy(() => import("./paginas/PaginaConfiguracion"));

const pagina = (elemento: JSX.Element) => <Suspense fallback={<EstadoCarga mensaje="Cargando…" />}>{elemento}</Suspense>;

export default function Aplicacion() {
  return (
    <Routes>
      {/* Tras una recarga en "/" se vuelve a la última pantalla; sin sesión previa, al panel. */}
      <Route path="/" element={<Navigate to={leerRutaPersistida() ?? "/panel"} replace />} />
      <Route path="/iniciar-sesion" element={<PaginaInicioSesion />} />
      {/* El primer acceso con Google ya crea el espacio del usuario: no hay registro aparte. */}
      <Route path="/registro" element={<Navigate to="/iniciar-sesion" replace />} />

      <Route element={<DisposicionApp />}>
        <Route path="/panel" element={<PaginaPanel />} />
        <Route path="/temas" element={pagina(<PaginaListaTemas />)} />
        <Route path="/estudio/nuevo" element={pagina(<PaginaNuevoTema />)} />

        <Route path="/estudio/:id" element={<DisposicionTema />}>
          <Route index element={<PaginaTema />} />
          <Route path="resumen" element={pagina(<PaginaResumen />)} />
          <Route path="preguntas" element={pagina(<PaginaPreguntas />)} />
          <Route path="prueba" element={pagina(<PaginaPrueba />)} />
          <Route path="resultados" element={pagina(<PaginaResultados />)} />
          <Route path="mapa-mental" element={pagina(<PaginaMapaMental />)} />
        </Route>

        <Route path="/progreso" element={pagina(<PaginaProgreso />)} />
        <Route path="/perfil" element={pagina(<PaginaPerfil />)} />
        <Route path="/configuracion" element={pagina(<PaginaConfiguracion />)} />
      </Route>

      <Route path="*" element={<PaginaNoEncontrada />} />
    </Routes>
  );
}
