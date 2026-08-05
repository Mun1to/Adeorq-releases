import type { NoteFile } from "./pty";

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
