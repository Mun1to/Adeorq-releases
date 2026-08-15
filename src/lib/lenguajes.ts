// Qué lenguaje se le da a CodeMirror según la extensión.
//
// Puro y aparte del componente para poder probarlo: es una tabla, y una tabla
// se equivoca en silencio. Un `.tsx` que se abre sin JSX no falla, solo se ve
// mal, y eso no lo canta ningún error.

import type { LanguageSupport } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";

/** La extensión en minúsculas, sin punto. "" si no tiene. */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  // Un archivo que EMPIEZA por punto (`.gitignore`) no tiene extensión: tiene
  // nombre. Sin esto, su lenguaje sería "gitignore".
  if (punto <= 0) return "";
  return nombre.slice(punto + 1).toLowerCase();
}

/** El lenguaje, o `null` si no hay uno mejor que texto plano. */
export function lenguajeDe(nombre: string): LanguageSupport | null {
  switch (extensionDe(nombre)) {
    case "ts":
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
      return json();
    case "md":
    case "mdx":
      return markdown();
    case "html":
    case "htm":
    case "svg":
      return html();
    default:
      return null;
  }
}
