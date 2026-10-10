// De qué clase es un archivo, por su nombre: lo que decide qué icono lleva en el
// árbol del panel de Archivos (`components/IconoArchivo.tsx`).
//
// Son ocho familias y no un icono por lenguaje, a propósito: el icono está para
// distinguir de un vistazo «esto es código, esto es una imagen, esto es un
// papel», no para adivinar el lenguaje, que ya lo dice la extensión escrita al
// lado. Un juego de doscientos logos de colores convierte el árbol en una feria
// y tapa lo que de verdad importa en él, que es el color del estado.
//
// No importa `lib/lenguajes.ts` aunque allí hay un `extensionDe`: ese módulo
// trae todo CodeMirror detrás, y el árbol se pinta al arrancar.

export type TipoArchivo = "web" | "codigo" | "estilo" | "datos" | "texto" | "imagen" | "consola" | "otro";

const POR_EXTENSION: Record<TipoArchivo, string[]> = {
  web: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "html", "htm", "vue", "svelte", "astro"],
  codigo: ["rs", "py", "go", "java", "kt", "kts", "c", "h", "cpp", "hpp", "cc", "cs", "rb", "php", "swift", "lua", "dart", "sql", "zig"],
  estilo: ["css", "scss", "sass", "less"],
  datos: ["json", "jsonc", "yaml", "yml", "toml", "xml", "csv", "tsv", "lock", "ini", "conf", "env", "properties", "plist"],
  texto: ["md", "mdx", "txt", "rst", "log", "pdf", "doc", "docx"],
  imagen: ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "mp4", "webm", "mov", "mp3", "wav", "ogg"],
  consola: ["sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd"],
  otro: [],
};

const TIPO_DE_EXTENSION = new Map<string, TipoArchivo>(
  (Object.entries(POR_EXTENSION) as [TipoArchivo, string[]][]).flatMap(([tipo, exts]) => exts.map((e) => [e, tipo] as const)),
);

/** Los que se reconocen por el nombre entero, sin extensión que mirar. */
const POR_NOMBRE: Record<string, TipoArchivo> = {
  dockerfile: "consola",
  makefile: "consola",
  justfile: "consola",
  license: "texto",
  licence: "texto",
  notice: "texto",
  readme: "texto",
  changelog: "texto",
  authors: "texto",
};

/** La extensión, en minúsculas y sin el punto; vacía si no tiene. Un archivo
    que EMPIEZA por punto (`.gitignore`) no tiene extensión: ese es su nombre. */
export function extensionDeNombre(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "";
}

export function tipoDeArchivo(nombre: string): TipoArchivo {
  const bajo = nombre.toLowerCase();
  // Los de configuración que empiezan por punto: `.gitignore`, `.env.local`, `.npmrc`.
  if (bajo.startsWith(".")) return "datos";
  const porNombre = POR_NOMBRE[bajo] ?? POR_NOMBRE[bajo.split(".")[0]];
  const ext = extensionDeNombre(bajo);
  return TIPO_DE_EXTENSION.get(ext) ?? porNombre ?? "otro";
}
