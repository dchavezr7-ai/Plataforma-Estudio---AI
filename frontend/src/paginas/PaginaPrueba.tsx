import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useContextoTema } from "../disposiciones/contextoTema";
import { useSesion, registrarActividad, registrarRespuestas } from "../almacen/almacenSesion";
import { respuestasDeRevision } from "../utilidades/rendimiento";
import * as studyService from "../servicios/servicioEstudio";
import { cargarAjustes, guardarAjustes, obtenerResumenGeneral } from "../servicios/servicioPruebas";
import { useControlPrueba } from "../hooks/useControlPrueba";
import type { AjustesPrueba, ResultadoCompleto } from "../tipos/prueba";
import { EstadoCarga, EmptyState } from "../componentes/Estados";
import Boton from "../componentes/Boton";
import ConfiguradorPrueba from "../componentes/prueba/ConfiguradorPrueba";
import EjecutorPrueba from "../componentes/prueba/EjecutorPrueba";
import { EntregandoPrueba, GenerandoPrueba, PausaPrueba, PruebaLista } from "../componentes/prueba/PantallasPrueba";
import { describirTiempo } from "../utilidades/tiempoPrueba";

export default function PaginaPrueba() {
  const { tema, establecerTema } = useContextoTema();
  const navegar = useNavigate();
  // Se relee cuando cambian los resúmenes de la sesión (p. ej. tras generar el del tema).
  const generados = useSesion((s) => s.resumenes[tema.id]);
  const resumen = useMemo(() => obtenerResumenGeneral(tema.id), [tema.id, generados]);
  const [ajustes, establecerAjustes] = useState<AjustesPrueba>(() => cargarAjustes(tema.id));
  const cancelar = useRef<AbortController | null>(null);

  useEffect(() => establecerAjustes(cargarAjustes(tema.id)), [tema.id]);

  async function alFinalizar(datos: ResultadoCompleto) {
    // Solo el servidor califica; aquí se actualiza el avance del tema con su resultado.
    await studyService.incrementarPruebasCompletadas(tema.id);
    const mezclado = Math.min(100, Math.round(tema.dominio * 0.35 + datos.resultado.porcentaje * 0.65));
    const actualizado = await studyService.actualizarDominioTema(tema.id, mezclado);
    if (actualizado) establecerTema(actualizado);
    registrarRespuestas(tema.id, respuestasDeRevision(datos.revision));
    registrarActividad({ tipo: "prueba", idTema: tema.id, tituloTema: tema.titulo, descripcion: `Completaste una prueba con ${datos.resultado.porcentaje}% de aciertos.` });
    navegar(`/estudio/${tema.id}/resultados`, { state: datos });
  }

  const c = useControlPrueba({ idTema: tema.id, tituloTema: tema.titulo, resumen, alFinalizar });

  function cambiarAjustes(siguiente: AjustesPrueba) {
    establecerAjustes(siguiente);
    guardarAjustes(tema.id, siguiente);
  }

  function generar() {
    cancelar.current?.abort();
    cancelar.current = new AbortController();
    void c.crear(ajustes, cancelar.current.signal);
  }

  if (c.fase === "cargando") return <EstadoCarga mensaje="Preparando tu prueba..." />;

  if (!resumen && (c.fase === "configuracion" || c.fase === "error")) {
    return (
      <EmptyState
        titulo="Primero necesitas un resumen"
        descripcion="Las pruebas se generan a partir del resumen general del tema. Crea el resumen y vuelve aquí."
        accion={<Boton onClick={() => navegar(`/estudio/${tema.id}/resumen`)}>Ir al resumen</Boton>}
        icono={<AlertTriangle size={22} />}
      />
    );
  }

  if (c.fase === "generando") return <GenerandoPrueba cantidad={ajustes.cantidad} alCancelar={() => cancelar.current?.abort()} />;
  if (c.fase === "entregando") return <EntregandoPrueba />;

  if (c.fase === "lista" && c.prueba) return <PruebaLista prueba={c.prueba} ocupado={c.ocupado} aviso={c.aviso} alComenzar={c.iniciar} alDescartar={c.abandonar} />;

  if (c.fase === "pausada" && c.tiempo) {
    const restante = c.tiempo.restanteSegundos;
    return <PausaPrueba restante={restante === null ? null : describirTiempo(restante)} ocupado={c.ocupado} aviso={c.aviso} alReanudar={c.reanudar} alEntregar={c.entregar} />;
  }

  if (c.fase === "ejecutando" && c.prueba?.preguntas && c.tiempo) {
    return (
      <EjecutorPrueba
        prueba={c.prueba}
        preguntas={c.prueba.preguntas}
        tiempo={c.tiempo}
        respuestas={c.respuestas}
        descartes={c.descartes}
        marcadas={c.marcadas}
        indice={c.indice}
        aviso={c.aviso}
        ocupado={c.ocupado}
        entregando={false}
        alIr={c.establecerIndice}
        alElegir={c.elegir}
        alDescartar={c.alternarDescarte}
        alMarcar={c.alternarMarca}
        alPausar={c.pausar}
        alEntregar={c.entregar}
        alAgotarTiempo={c.entregar}
      />
    );
  }

  if (c.fase === "ejecutando") return <EstadoCarga mensaje="Recuperando tu prueba..." />;

  return resumen ? <ConfiguradorPrueba tituloTema={tema.titulo} resumen={resumen} ajustes={ajustes} alCambiar={cambiarAjustes} alIniciar={generar} error={c.error} /> : null;
}
