// Qué lenguaje se le da a CodeMirror según el archivo.
//
// Puro y aparte del componente para poder probarlo: es una tabla, y una tabla
// se equivoca en silencio. Un `.tsx` que se abre sin JSX no falla, solo se ve
// mal, y eso no lo canta ningún error. Su banco: `pnpm bancos lenguajes`.
//
// Los seis primeros son los paquetes propios de CodeMirror. Los demás salen de
// sus «modos antiguos» (`@codemirror/legacy-modes`): colorean sin entender la
// estructura (no pliegan por bloques), que para leer un `.toml` o un `.ps1` es
// lo que hace falta. Sin ellos, medio repo se abría en gris: `Cargo.toml`, los
// `.ps1` de `scripts/`, los `.yml` de los flujos y cualquier `.py`.

import { LanguageSupport, StreamLanguage, type StreamParser } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { go } from "@codemirror/legacy-modes/mode/go";
import { c, cpp, csharp, java, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { diff } from "@codemirror/legacy-modes/mode/diff";

/** La extensión en minúsculas, sin punto. "" si no tiene. */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  // Un archivo que EMPIEZA por punto (`.gitignore`) no tiene extensión: tiene
  // nombre. Sin esto, su lenguaje sería "gitignore".
  if (punto <= 0) return "";
  return nombre.slice(punto + 1).toLowerCase();
}

// Los modos antiguos vienen tipados con su propio paquete (`streamparser`), que
// es la misma forma con otro nombre: por eso el `as`.
const antiguo = (modo: object) => new LanguageSupport(StreamLanguage.define(modo as StreamParser<unknown>));

/** Los que se reconocen por el nombre entero, porque no llevan extensión. */
function porNombre(nombre: string): LanguageSupport | null {
  const n = nombre.toLowerCase();
  if (n === "dockerfile" || n.startsWith("dockerfile.")) return antiguo(dockerFile);
  if (n === ".gitignore" || n === ".gitattributes" || n === ".env" || n.startsWith(".env.") || n === ".npmrc" || n === ".editorconfig") {
    return antiguo(properties);
  }
  if (n === ".bashrc" || n === ".zshrc" || n === ".profile") return antiguo(shell);
  return null;
}

/** El lenguaje, o `null` si no hay uno mejor que texto plano. */
export function lenguajeDe(nombre: string): LanguageSupport | null {
  const propio = porNombre(nombre);
  if (propio) return propio;
  switch (extensionDe(nombre)) {
    case "ts":
    case "mts":
    case "cts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "jsx":
      return javascript({ jsx: true });
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "rs":
      return rust();
    case "css":
    case "scss":
    case "less":
      return css();
    case "json":
    case "jsonl":
    case "webmanifest":
      return json();
    case "md":
    case "mdx":
    case "mdc":
      return markdown();
    case "html":
    case "htm":
    case "svg":
    case "xml":
    case "vue":
    case "svelte":
    case "astro":
      return html();
    case "py":
    case "pyw":
      return python();
    case "yml":
    case "yaml":
      return yaml();
    case "toml":
    case "lock":
      return antiguo(toml);
    case "sh":
    case "bash":
    case "zsh":
      return antiguo(shell);
    case "ps1":
    case "psm1":
    case "psd1":
      return antiguo(powerShell);
    case "go":
      return antiguo(go);
    case "c":
    case "h":
      return antiguo(c);
    case "cpp":
    case "cc":
    case "hpp":
      return antiguo(cpp);
    case "cs":
      return antiguo(csharp);
    case "java":
      return antiguo(java);
    case "kt":
    case "kts":
      return antiguo(kotlin);
    case "sql":
      return antiguo(standardSQL);
    case "ini":
    case "conf":
    case "cfg":
    case "properties":
      return antiguo(properties);
    case "diff":
    case "patch":
      return antiguo(diff);
    default:
      return null;
  }
}
