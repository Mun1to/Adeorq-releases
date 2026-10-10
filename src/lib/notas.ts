import type { NoteFile, PaneStatus, Project } from "./pty";

// El formato de una nota del lienzo, aparte de su tarjeta.
//
// Una nota es un `.md` normal y corriente en %LOCALAPPDATA%\Adeorq\notas, y
// esa decisión es la feature entera: un agente conectado tiene que poder abrir
// el archivo y MARCAR una casilla cuando termina. Un agente sabe editar
// markdown; nuestro formato de tablero no lo conoce nadie.
//
//     # Antes del lunes
//
//     - [ ] aviso de IA en la web
//     - [x] publicar la 0.8.5
//     llamar al gestor
//
// La primera línea `# ` es el título, y una línea que empieza por `- [ ]` o
// `- [x]` es una casilla. Todo lo demás es texto y se respeta tal cual: aquí
// no se normaliza nada, porque el archivo también lo edita él a mano.

const CASILLA = /^(\s*)-\s\[([ xX])\]\s?(.*)$/;

export interface Linea {
  n: number;
  /** null si la línea no es una casilla. */
  hecha: boolean | null;
  texto: string;
}

export function leerLineas(texto: string): Linea[] {
  return texto.split("\n").map((l, n) => {
    const m = CASILLA.exec(l);
    if (m) return { n, hecha: m[2].toLowerCase() === "x", texto: m[3] };
    return { n, hecha: null, texto: l };
  });
}

/** Marca o desmarca una casilla dejando el resto del archivo intacto. */
export function voltear(texto: string, n: number): string {
  const lineas = texto.split("\n");
  const m = CASILLA.exec(lineas[n] ?? "");
  if (!m) return texto;
  lineas[n] = `${m[1]}- [${m[2].toLowerCase() === "x" ? " " : "x"}] ${m[3]}`;
  return lineas.join("\n");
}

export function tituloDe(texto: string): string {
  const primera = texto.split("\n")[0] ?? "";
  return primera.startsWith("# ") ? primera.slice(2).trim() : "";
}

export function conTitulo(texto: string, titulo: string): string {
  const lineas = texto.split("\n");
  if (lineas[0]?.startsWith("# ")) {
    lineas[0] = `# ${titulo}`;
    return lineas.join("\n");
  }
  return `# ${titulo}\n\n${texto}`;
}

/** El cuerpo: todo menos el encabezado del título y su línea en blanco. */
export function cuerpoDe(texto: string): string {
  const lineas = texto.split("\n");
  if (!lineas[0]?.startsWith("# ")) return texto;
  const resto = lineas.slice(1);
  if (resto[0] === "") resto.shift();
  return resto.join("\n");
}

export function conCuerpo(texto: string, cuerpo: string): string {
  const titulo = tituloDe(texto);
  return titulo ? `# ${titulo}\n\n${cuerpo}` : cuerpo;
}

/**
 * Lo que se le escribe a una terminal cuando le conectas esta nota.
 *
 * Va en español y armado aquí, como todo lo que Adeorq le dice a un agente:
 * es un hecho comprobable del tablero, no algo que deba adivinar. Lleva la
 * RUTA porque ahí está la gracia: con ella el agente puede marcar la casilla
 * al terminar, que es lo que pidió Munir. Y lleva la instrucción de tocar solo
 * esa línea, porque un agente servicial reescribe de más.
 */
export function encargoDeNota(f: NoteFile): string {
  const titulo = tituloDe(f.text) || "sin título";
  const lineas = leerLineas(cuerpoDe(f.text));
  const tareas = lineas.filter((l) => l.hecha !== null);
  const quedan = tareas.filter((l) => !l.hecha);
  const sueltas = lineas
    .filter((l) => l.hecha === null && l.texto.trim())
    .map((l) => l.texto.trim());

  const partes: string[] = [`Estás conectado a mi nota «${titulo}».`, `Archivo: ${f.path}`];

  if (tareas.length) {
    partes.push(
      quedan.length
        ? `Tareas pendientes (${quedan.length} de ${tareas.length}):\n${quedan
            .map((l) => `- ${l.texto}`)
            .join("\n")}`
        : "Todas las tareas de la nota están marcadas como hechas.",
    );
  }
  if (sueltas.length) partes.push(`Lo demás que dice la nota:\n${sueltas.join("\n")}`);
  if (!tareas.length && !sueltas.length) partes.push("La nota está vacía por ahora.");

  if (quedan.length) {
    partes.push(
      "Ve una por una, de arriba abajo, y pregúntame si algo no está claro.\n" +
        "Cuando termines una DE VERDAD, edita ese archivo y cambia su «- [ ]» por " +
        "«- [x]» en esa línea, sin tocar nada más. Lo que no puedas hacer, déjalo " +
        "sin marcar y dime por qué.",
    );
  }
  return partes.join("\n\n");
}

/** Una terminal a la que se le puede lanzar una nota. */
export interface Destino {
  id: number;
  nombre: string;
  estado: PaneStatus["state"];
  /** Falso si lanzarle algo ahora haría daño; el motivo lo da el estado. */
  puede: boolean;
}

/**
 * A qué terminales se puede lanzar una nota: los agentes primero, y cada grupo
 * en el orden en que se abrieron.
 *
 * A una que te está preguntando algo NO se le lanza: lo que se le escriba
 * contestaría a su pregunta (un «1» o un «sí» que nadie quiso dar), no sería
 * un encargo. A una que trabaja sí: Claude Code lo encola para cuando acabe.
 */
export function destinosDeNota(estados: Record<number, PaneStatus>): Destino[] {
  return Object.values(estados)
    .slice()
    .sort((a, b) => Number(b.agent) - Number(a.agent) || a.id - b.id)
    .map((p) => ({ id: p.id, nombre: p.name, estado: p.state, puede: p.state !== "pregunta" }));
}

/** Las tareas que quedan sin marcar, con su texto a secas. */
export function tareasPendientes(texto: string): string[] {
  return leerLineas(cuerpoDe(texto))
    .filter((l) => l.hecha === false && l.texto.trim())
    .map((l) => l.texto.trim());
}

/**
 * De qué va la nota, sin el envoltorio del encargo.
 *
 * El encargo que recibe el agente trae la ruta del archivo y las reglas de
 * marcar casillas. Quien le pone nombre a la terminal y elige con qué modelo
 * nace tiene que mirar lo que escribiste TÚ, no esas instrucciones: lo ya hecho
 * tampoco cuenta, porque no es trabajo que quede.
 */
export function sobreNota(texto: string): { nombre: string; juzgar: string } {
  const titulo = tituloDe(texto);
  const queda = leerLineas(cuerpoDe(texto))
    .filter((l) => l.hecha !== true && l.texto.trim())
    .map((l) => l.texto.trim());
  return { nombre: titulo || queda[0] || "nota", juzgar: [titulo, ...queda].filter(Boolean).join("\n") };
}

/** Un proyecto donde puede nacer la sesión de una nota, y por qué va arriba. */
export interface DondeNace {
  nombre: string;
  ruta: string;
  /** «nombrado» si la nota lo menciona, «lienzo» si es el de este lienzo. */
  porque: "nombrado" | "lienzo" | "";
}

/** Lo que puede formar parte de una palabra, para un `[...]` de expresión regular. */
const LETRA = "\\p{L}\\p{N}_";

/**
 * En qué proyectos puede nacer una sesión para esta nota, lo más probable
 * arriba: primero los que la nota NOMBRA, después el del lienzo, y el resto en
 * el orden en que venían.
 *
 * El nombre tiene que salir como palabra entera: «Layco» dentro de «Laycos» no
 * cuenta. Y esto no decide nada, solo ordena: una coincidencia tonta sube un
 * proyecto en la lista, no abre ninguna terminal.
 */
export function proyectosDeNota(proyectos: Project[], delLienzo: string, texto: string): DondeNace[] {
  const nombra = (nombre: string) =>
    nombre.length >= 3 &&
    new RegExp(`(^|[^${LETRA}])${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^${LETRA}])`, "iu").test(texto);
  const orden = { nombrado: 0, lienzo: 1, "": 2 };
  return proyectos
    .map((p, i) => {
      const porque: DondeNace["porque"] = nombra(p.name) ? "nombrado" : p.name === delLienzo ? "lienzo" : "";
      return { d: { nombre: p.name, ruta: p.path, porque }, i };
    })
    .sort((a, b) => orden[a.d.porque] - orden[b.d.porque] || a.i - b.i)
    .map((x) => x.d);
}
