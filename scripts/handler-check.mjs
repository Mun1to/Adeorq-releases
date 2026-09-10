// Que un `onClick={fn}` no vuelva a colar el evento del ratón como argumento.
//   `node scripts/handler-check.mjs`   ·   `pnpm handler`
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// Este es el error #31, el que costó cuatro intentos. `PanelDerecho` tenía:
//
//     onClick={onWeb}          // la prop, declarada `onWeb?: () => void`
//
// y arriba, en `App.tsx`:
//
//     onWeb={abrirWeb}         // abrirWeb = (url?: string, traer = true) => ...
//
// React llama al manejador con el evento del ratón, así que `abrirWeb` recibía
// un `MouseEvent` donde esperaba una dirección, lo guardaba como si fuera la
// URL del panel y el `WebPane` intentaba pintar un objeto. TypeScript no lo
// caza y no es un fallo suyo: una función con TODOS sus parámetros opcionales
// es asignable a `() => void`, y ahí la cadena parece sana. Es la misma trampa
// que `array.map(parseInt)`.
//
// Lo difícil es que son DOS SALTOS en dos archivos: el hijo conecta su prop a
// un manejador del DOM, y el padre le enchufa una función con parámetros.
// Ningún grep de un solo salto lo ve, y por eso se buscó cuatro veces dónde se
// PINTABA el objeto en vez de de dónde SALÍA.
//
// ── LA REGLA ────────────────────────────────────────────────────────────────
//
// Un manejador de un elemento del DOM (`<button onClick=...>`) no recibe un
// identificador pelado si la función que hay detrás acepta parámetros. Se
// escribe `onClick={() => algo()}`, que dice con cuántos argumentos se llama.
//
// Pasarle la prop a un COMPONENTE (`<Panel onWeb={abrirWeb} />`) no se toca:
// ahí no hay ningún evento, y es como se reparte el trabajo entre padre e hijo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Los que React llama con un evento. No entra `onChange` de un componente. */
const DEL_DOM =
  /^on(Click|DoubleClick|Change|Input|Submit|Focus|Blur|KeyDown|KeyUp|KeyPress|MouseDown|MouseUp|MouseEnter|MouseLeave|MouseMove|MouseOver|MouseOut|Wheel|Scroll|Drag|DragStart|DragEnd|DragOver|DragEnter|DragLeave|Drop|Paste|Copy|Cut|ContextMenu|TouchStart|TouchEnd|TouchMove|PointerDown|PointerUp|PointerMove|Reset|Load|Error)$/;

/** Un primer parámetro que SÍ es el evento: entonces la conexión es correcta. */
const ES_EVENTO = /^(e|ev|evt|event|_e)\b|:\s*(React\.)?\w*(Mouse|Keyboard|Change|Focus|Form|Drag|Touch|Pointer|Wheel|Clipboard|Ui|Synthetic)\w*Event/;

function tsx(dir) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...tsx(p));
    else if (e.name.endsWith(".tsx")) salida.push(p);
  }
  return salida;
}

const sinComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^[^\n"'`]*\/\/[^\n]*$/gm, "");

/** Los parámetros declarados de `nombre`, si se declara en este archivo. */
function paramsDe(texto, nombre) {
  // const nombre = (params) => ...      · const nombre = useCallback((params) => ...
  const flecha = texto.match(
    new RegExp(`\\bconst\\s+${nombre}\\s*(?::[^=]+)?=\\s*(?:useCallback\\s*\\(\\s*)?\\(([^)]*)\\)\\s*(?::[^=]*)?=>`),
  );
  if (flecha) return flecha[1].trim();
  const decl = texto.match(new RegExp(`\\bfunction\\s+${nombre}\\s*\\(([^)]*)\\)`));
  if (decl) return decl[1].trim();
  return null;
}

/** Si `nombre` es una prop de este componente, el tipo con el que se declara. */
function propDe(texto, nombre) {
  const m = texto.match(new RegExp(`^\\s*${nombre}\\??\\s*:\\s*(\\([^)]*\\)\\s*=>[^;\\n]*)`, "m"));
  return m ? m[1].trim() : null;
}

/**
 * Con qué nombre se usa este archivo desde fuera: `<WebPane ... />`.
 *
 * Hace falta para no cruzar dos props que solo comparten el nombre. Sin esto,
 * `onClose` (que lo tienen ocho componentes) daba cinco falsos positivos a la
 * primera: decía que `RepartoView` recibía el `closePane` que en realidad
 * viajaba a `WebPane`.
 */
function componenteDe(archivo, texto) {
  const m =
    texto.match(/export\s+default\s+function\s+([A-Z]\w*)/) ||
    texto.match(/export\s+default\s+(?:React\.)?memo\(\s*(?:function\s+)?([A-Z]\w*)/) ||
    texto.match(/export\s+function\s+([A-Z]\w*)/);
  return m ? m[1] : path.basename(archivo, ".tsx");
}

/** La etiqueta que contiene esa posición: `button` (DOM) o `Panel` (componente). */
function etiquetaEn(texto, pos) {
  const abre = texto.lastIndexOf("<", pos);
  if (abre < 0) return null;
  if (texto.slice(abre, pos).includes(">")) return null; // ese `<` ya cerró
  const m = texto.slice(abre).match(/^<\s*([A-Za-z][\w.]*)/);
  return m ? m[1] : null;
}

export function revisar(raiz = RAIZ) {
  const archivos = tsx(raiz);
  const fuentes = new Map(archivos.map((f) => [f, sinComentarios(fs.readFileSync(f, "utf8"))]));
  const culpables = [];

  for (const [archivo, texto] of fuentes) {
    for (const m of texto.matchAll(/\bon([A-Z]\w*)\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
      const manejador = "on" + m[1];
      const nombre = m[2];
      if (!DEL_DOM.test(manejador)) continue;

      // Solo cuenta si cuelga de un elemento del DOM (minúscula).
      const etiqueta = etiquetaEn(texto, m.index);
      if (!etiqueta || !/^[a-z]/.test(etiqueta)) continue;

      const linea = texto.slice(0, m.index).split("\n").length;

      // Salto 1: ¿es una función de este mismo archivo?
      const locales = paramsDe(texto, nombre);
      if (locales !== null) {
        if (locales !== "" && !ES_EVENTO.test(locales)) {
          culpables.push({
            archivo,
            linea,
            que: `${etiqueta} ${manejador}={${nombre}}`,
            porque: `«${nombre}» recibe (${locales}), y React le va a pasar el evento ahí`,
          });
        }
        continue;
      }

      // Salto 2: es una prop. Hay que ver qué le enchufan los padres.
      const tipo = propDe(texto, nombre);
      if (tipo === null) continue;
      const declarados = tipo.slice(1, tipo.indexOf(")")).trim();
      if (declarados !== "" && ES_EVENTO.test(declarados)) continue;

      const miNombre = componenteDe(archivo, texto);
      for (const [padre, fuentePadre] of fuentes) {
        if (padre === archivo) continue;
        for (const p of fuentePadre.matchAll(
          new RegExp(`\\b${nombre}\\s*=\\s*\\{\\s*([A-Za-z_$][\\w$]*)\\s*\\}`, "g"),
        )) {
          // Que sea de VERDAD para este componente, y no otra prop que se
          // llame igual en otro sitio.
          if (etiquetaEn(fuentePadre, p.index) !== miNombre) continue;
          const params = paramsDe(fuentePadre, p[1]);
          if (params && params !== "" && !ES_EVENTO.test(params)) {
            culpables.push({
              archivo,
              linea,
              que: `${etiqueta} ${manejador}={${nombre}}`,
              porque:
                `«${nombre}» se declara aquí como ${tipo}, pero ` +
                `${path.basename(padre)}:${fuentePadre.slice(0, p.index).split("\n").length} ` +
                `le pasa «${p[1]}», que recibe (${params})`,
            });
          }
        }
      }
    }
  }
  return culpables;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const malos = revisar();
  if (malos.length) {
    console.error("\nESTOS MANEJADORES LE PASAN EL EVENTO DEL RATON COMO ARGUMENTO:\n");
    for (const c of malos) {
      const donde = path.relative(path.join(RAIZ, ".."), c.archivo).replace(/\\/g, "/");
      console.error(`  ${donde}:${c.linea}  <${c.que}`);
      console.error(`      ${c.porque}\n`);
    }
    console.error(
      "  Envuélvelo: `onClick={() => algo()}`. Así se ve con cuántos\n" +
        "  argumentos se llama, que es lo que TypeScript no puede decirte:\n" +
        "  una función con todos sus parámetros opcionales encaja en `() => void`.\n",
    );
    process.exit(1);
  }
  console.log("ok  ningún manejador del DOM recibe una función con parámetros");
}
