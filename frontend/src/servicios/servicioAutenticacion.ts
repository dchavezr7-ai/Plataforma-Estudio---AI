import type { Usuario } from "../tipos";
import { iniciarFlujoGoogle } from "./servicioGoogle";
import { limpiarDatosDeUsuario } from "../utilidades/limpiezaSesion";
import { activarPersistenciaEstudio, restaurarEstudio } from "../almacen/almacenSesion";
import { borrarSesionPersistida, guardarUsuarioPersistido, leerUsuarioPersistido } from "../almacen/persistenciaSesion";

// -----------------------------------------------------------------------
// Sesión de la aplicación. No hay base de datos ni cookies propias.
// El perfil del usuario (id, nombre, correo y foto; NUNCA un token ni una contraseña)
// vive en memoria y se copia en sessionStorage para que F5 / Ctrl+R no obliguen a
// volver a identificarse. Al cerrar sesión o cerrar la pestaña, desaparece. El token
// de Google se descarta nada más leer el perfil y no se guarda en ningún sitio.
//
// Cerrar sesión aquí NO cierra la sesión global de Google en el navegador
// (eso no está en manos de la aplicación); solo olvida el perfil y los datos
// de estudio de este usuario. El siguiente acceso vuelve a mostrar el selector
// de cuentas, de modo que se puede entrar con otra distinta.
// -----------------------------------------------------------------------

let usuarioActual: Usuario | null = null;
let sesionRevisada = false;

export function iniciarSesionConGoogle(): Promise<Usuario> {
  // Se devuelve la promesa tal cual: la ventana emergente debe abrirse dentro del gesto del clic.
  return iniciarFlujoGoogle().then((usuario) => {
    limpiarDatosDeUsuario(); // nunca heredar datos de una sesión anterior
    usuarioActual = usuario;
    sesionRevisada = true;
    guardarUsuarioPersistido(usuario);
    activarPersistenciaEstudio(usuario.id);
    return usuario;
  });
}

export function cerrarSesion(): void {
  usuarioActual = null;
  sesionRevisada = true;
  limpiarDatosDeUsuario();
  borrarSesionPersistida();
}

/**
 * Usuario de la sesión. La primera vez tras un arranque (p. ej. una recarga) intenta
 * recuperar el perfil guardado en sessionStorage; es síncrono, así que la interfaz nunca
 * llega a pintar el login antes de saber si había sesión.
 */
export function obtenerUsuarioActual(): Usuario | null {
  if (!sesionRevisada) {
    sesionRevisada = true;
    const guardado = leerUsuarioPersistido();
    if (guardado) {
      usuarioActual = guardado;
      restaurarEstudio(guardado.id);
    }
  }
  return usuarioActual;
}
