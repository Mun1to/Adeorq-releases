import { invoke } from "@tauri-apps/api/core";

// Quién eres y dónde tienes tus cosas: lo que el onboarding pregunta la primera
// vez que se abre Adeorq.
//
// Hasta ahora la app daba por hecho que el usuario era Munir: la carpeta de
// proyectos era la constante `C:\proyectos` dentro de Rust, así que cualquier
// otro ordenador enseñaba un panel vacío sin explicar por qué ni ofrecer dónde
// cambiarlo. La carpeta vive AQUÍ, en el front, como el resto de la
// configuración de la app; Rust la recibe en cada llamada y guarda una copia en
// disco solo para el puente MCP, que corre sin ventana y no puede preguntar.

const KEY = "adeorq-perfil";

export interface Perfil {
  /** Cómo se llama, para saludar y para firmar lo que se le enseña a un agente. */
  nombre: string;
  /** La carpeta donde viven sus proyectos. Vacío = la que Rust decida. */
  raiz: string;
  /**
   * No tiene una carpeta madre con todo dentro, y no pasa nada: trabaja con
   * sesiones sueltas y con los proyectos que vaya añadiendo de donde sea.
   *
   * Hace falta un campo propio porque «vacío» ya significa otra cosa: que
   * Rust elija (`raiz_de`). Sin esto, omitir la pregunta acababa listando
   * Descargas, Documentos y Escritorio como si fueran proyectos suyos, que es
   * peor que no poder omitirla.
   */
  sinRaiz: boolean;
  /**
   * Proyectos de fuera de la carpeta madre, con su ruta entera. El panel dejó
   * de ser «las subcarpetas de una carpeta» para ser «los proyectos que tú
   * dices»: uno puede vivir en otro disco y salir en la lista igual.
   */
  extras: string[];
  /** Si puede leer las sesiones de agentes que ya hay en el ordenador. */
  leerSesiones: boolean;
  /** Los clientes que dijo que usa, para no ofrecerle los otros de primeras. */
  clis: string[];
  /** Terminó las preferencias iniciales. */
  hecho: boolean;
  /** Vio el recorrido por las funciones. */
  tour: boolean;
}

export const PERFIL_VACIO: Perfil = {
  nombre: "",
  raiz: "",
  sinRaiz: false,
  extras: [],
  leerSesiones: true,
  clis: [],
  hecho: false,
  tour: false,
};

/** Lo guardado, completado con lo que falte: una versión vieja del perfil no
    puede dejar la app sin arrancar por un campo que aún no existía. */
export function leerPerfil(): Perfil {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...PERFIL_VACIO };
    const p = JSON.parse(raw) as Partial<Perfil>;
    return {
      ...PERFIL_VACIO,
      ...p,
      clis: Array.isArray(p.clis) ? p.clis : [],
      extras: Array.isArray(p.extras) ? p.extras : [],
    };
  } catch {
    return { ...PERFIL_VACIO };
  }
}

export function guardarPerfil(p: Perfil): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin sitio en localStorage: mejor seguir que romper el arranque */
  }
}

export function tocarPerfil(cambio: Partial<Perfil>): Perfil {
  const next = { ...leerPerfil(), ...cambio };
  guardarPerfil(next);
  // Aquí y no en cada sitio que los cambia: por esta función pasan todos los
  // cambios del perfil, así que la copia del puente no se puede quedar vieja
  // por un llamador que se olvide. La guarda evita escribir en cada tecla del
  // nombre, que también pasa por aquí.
  if (cambio.sinRaiz !== undefined || cambio.extras !== undefined) avisarAlPuente(next);
  return next;
}

/** La raíz para mandarle a Rust. Vacío significa «decídela tú», que en la
    máquina de Munir sigue siendo `C:\proyectos` y en una nueva es la carpeta
    de usuario hasta que el onboarding pregunte. */
export function raiz(): string {
  return leerPerfil().raiz;
}

/** Trabaja sin carpeta madre: ni proyectos que listar ni ruta que enseñar. */
export function sinRaiz(): boolean {
  return leerPerfil().sinRaiz;
}

const limpiar = (p: string) => p.trim().replace(/[\\/]+$/, "");

/** Deja en disco lo que la ventana acaba de decidir sobre los proyectos, para
    el puente MCP, que corre sin ventana y no ve el localStorage. Si falla se
    calla: es una copia, y perderla no puede tumbar un ajuste. */
function avisarAlPuente(p: Perfil): void {
  void invoke("set_extra_projects", { sinRaiz: p.sinRaiz, extras: p.extras }).catch(() => {});
}

/** Mete una carpeta cualquiera del disco en el panel como proyecto. Devuelve
    si de verdad se añadió: la que ya estaba no se apunta dos veces, y una que
    ya es subcarpeta de la raíz tampoco, que saldría duplicada en la lista. */
export function anadirProyecto(ruta: string): boolean {
  const limpia = limpiar(ruta);
  if (!limpia) return false;
  const p = leerPerfil();
  const bajo = limpiar(p.raiz).toLowerCase();
  const low = limpia.toLowerCase();
  if (!p.sinRaiz && bajo && low.startsWith(`${bajo}\\`) && !low.slice(bajo.length + 1).includes("\\")) {
    return false;
  }
  if (p.extras.some((e) => limpiar(e).toLowerCase() === low)) return false;
  tocarPerfil({ extras: [...p.extras, limpia] });
  return true;
}

/** Lo saca del panel. La carpeta no se toca: esto es una lista, no un disco. */
export function quitarProyecto(ruta: string): void {
  const low = limpiar(ruta).toLowerCase();
  tocarPerfil({ extras: leerPerfil().extras.filter((e) => limpiar(e).toLowerCase() !== low) });
}

/** Lo que Rust usaría si nadie le dice nada: lo que se propone en el onboarding. */
export function raizPorDefecto(): Promise<string> {
  return invoke("default_projects_root");
}

/** Deja la carpeta elegida también en disco, para el puente MCP. Devuelve la
    ruta ya limpia, o falla si esa carpeta no existe. */
export function fijarRaiz(path: string): Promise<string> {
  return invoke("set_projects_root", { path });
}
