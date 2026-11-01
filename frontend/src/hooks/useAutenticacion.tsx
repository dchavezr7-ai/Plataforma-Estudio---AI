import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Usuario } from "../tipos";
import * as authService from "../servicios/servicioAutenticacion";

interface ValorContextoAutenticacion {
  usuario: Usuario | null;
  estaAutenticado: boolean;
  /** Abre el selector de cuentas de Google. Llamar directamente desde un clic. */
  iniciarSesionConGoogle: () => Promise<Usuario>;
  cerrarSesion: () => void;
}

const ContextoAutenticacion = createContext<ValorContextoAutenticacion | undefined>(undefined);

export function ProveedorAutenticacion({ children }: { children: ReactNode }) {
  // Se recupera de sessionStorage si la página se recargó; si no hay sesión guardada, empieza vacía.
  const [usuario, establecerUsuario] = useState<Usuario | null>(() => authService.obtenerUsuarioActual());

  const iniciarSesionConGoogle = useCallback(() => {
    return authService.iniciarSesionConGoogle().then((usuarioAutenticado) => {
      establecerUsuario(usuarioAutenticado);
      return usuarioAutenticado;
    });
  }, []);

  const cerrarSesion = useCallback(() => {
    authService.cerrarSesion();
    establecerUsuario(null);
  }, []);

  const valor = useMemo(
    () => ({ usuario, estaAutenticado: usuario !== null, iniciarSesionConGoogle, cerrarSesion }),
    [usuario, iniciarSesionConGoogle, cerrarSesion]
  );

  return <ContextoAutenticacion.Provider value={valor}>{children}</ContextoAutenticacion.Provider>;
}

export function useAutenticacion(): ValorContextoAutenticacion {
  const ctx = useContext(ContextoAutenticacion);
  if (!ctx) throw new Error("useAutenticacion debe usarse dentro de un ProveedorAutenticacion");
  return ctx;
}
