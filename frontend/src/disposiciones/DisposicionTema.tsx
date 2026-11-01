import { useEffect, useState } from "react";
import { Outlet, useParams, Link, useLocation } from "react-router-dom";
import type { TemaEstudio } from "../tipos";
import * as studyService from "../servicios/servicioEstudio";
import { moduloDesdeSegmento } from "../datos/modulosEstudio";
import { EstadoCarga, ErrorState, EmptyState } from "../componentes/Estados";
import EncabezadoModulo from "../componentes/estudio/EncabezadoModulo";
import { ContextoTema } from "./contextoTema";

export default function DisposicionTema() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const [tema, establecerTema] = useState<TemaEstudio | null>(null);
  const [estado, establecerEstado] = useState<"cargando" | "exito" | "error" | "vacio">("cargando");

  async function cargar() {
    if (!id) return;
    establecerEstado("cargando");
    try {
      const resultado = await studyService.obtenerTemaEstudio(id);
      if (!resultado) {
        establecerEstado("vacio");
        return;
      }
      establecerTema(resultado);
      establecerEstado("exito");
    } catch {
      establecerEstado("error");
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (estado === "cargando") return <EstadoCarga mensaje="Cargando tema de estudio..." />;
  if (estado === "error") return <ErrorState alReintentar={cargar} />;
  if (estado === "vacio" || !tema) {
    return (
      <EmptyState
        titulo="No encontramos este tema"
        descripcion="Puede que haya sido eliminado o que el enlace sea incorrecto."
        accion={
          <Link to="/temas" className="btn btn-primary">
            Volver a mis estudios
          </Link>
        }
      />
    );
  }

  // Sin módulo en la ruta (/estudio/:id) se muestra la pantalla principal del tema, que lleva su propio encabezado.
  const modulo = moduloDesdeSegmento(pathname.split("/")[3]);

  return (
    <ContextoTema.Provider value={{ tema, refrescar: cargar, establecerTema }}>
      <div className="topic-shell">
        {modulo && <EncabezadoModulo tema={tema} modulo={modulo} />}

        {/* key: cada módulo entra con su propia transición sin recargar el tema */}
        <div className="topic-body tab-enter" key={pathname}>
          <Outlet />
        </div>
      </div>
    </ContextoTema.Provider>
  );
}
