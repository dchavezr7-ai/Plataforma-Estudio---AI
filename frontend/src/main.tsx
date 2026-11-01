import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Aplicacion from "./App";
import { ProveedorAutenticacion } from "./hooks/useAutenticacion";
import { ProveedorAviso } from "./hooks/useAviso";
import { ProveedorTemaVisual } from "./hooks/useTemaVisual";
import { ProveedorBarraLateral } from "./hooks/useBarraLateral";
import PuertaBackend from "./componentes/PuertaBackend";
import { almacenBackend } from "./almacen/almacenBackend";
import "./estilos/tokens.css";
import "./estilos/componentes.css";
import "./estilos/disposicion.css";
import "./estilos/paginas.css";
import "./estilos/oscuro.css";
import "./estilos/temas.css";
import "./estilos/remasterizado.css";
import "./estilos/sistema.css";
import "./estilos/acceso.css";
import "./estilos/pruebas.css";
import "./estilos/refinamientos.css";
import "./estilos/estudio.css";

// La comprobación del backend empieza ya, antes de que React termine de montar la interfaz.
almacenBackend.iniciar();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProveedorTemaVisual>
      <PuertaBackend>
        <BrowserRouter>
          <ProveedorAutenticacion>
            <ProveedorAviso>
              <ProveedorBarraLateral>
                <Aplicacion />
              </ProveedorBarraLateral>
            </ProveedorAviso>
          </ProveedorAutenticacion>
        </BrowserRouter>
      </PuertaBackend>
    </ProveedorTemaVisual>
  </React.StrictMode>
);
