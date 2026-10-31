// La ventana de Adeorq sigue blindada: cada iframe de una web lleva su sandbox.
//
//     node scripts/ventana-check.mjs
//
// Lo de verdad lo mide `scripts/laboratorio/csp-ventana.mjs` con el programa
// empaquetado (clics dentro de una web, descargas, la CSP en vigor). Esto es la
// red barata que corre en cada `pnpm comprobar`: que nadie quite el `sandbox`
// de un iframe ni le añada `allow-top-navigation`, que es justo lo que dejaba a
// una web llevarse la ventana entera de Adeorq a otra dirección.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
let fallos = 0;
const dice = (bien, que) => {
  console.log(`${bien ? "ok  " : "MAL "} ${que}`);
  if (!bien) fallos++;
};

/* ── El sandbox de los iframes ─────────────────────────────────────────── */
const permisos = [...leer("src/lib/sandboxWeb.ts").matchAll(/^\s*"(allow-[a-z-]+)",?$/gm)].map((m) => m[1]);
dice(!permisos.some((p) => p.startsWith("allow-top-navigation")), "SANDBOX_WEB no deja que una web se lleve la ventana (sin allow-top-navigation)");
for (const permiso of ["allow-scripts", "allow-forms", "allow-downloads", "allow-popups"]) {
  dice(permisos.includes(permiso), `SANDBOX_WEB deja ${permiso}, que el laboratorio mide`);
}

/* Todos los <iframe> de los componentes: los de una web llevan SANDBOX_WEB.
   Los que no pintan una web, apartados con su porqué. */
const NO_SON_WEB = {
  "ed-pdf": "el PDF de un archivo tuyo, con el visor del propio WebView (EditorPane)",
};
const componentes = readdirSync(join(RAIZ, "src", "components")).filter((f) => f.endsWith(".tsx"));
let marcos = 0;
for (const f of componentes) {
  const fuente = leer(join("src", "components", f));
  for (const m of fuente.matchAll(/<iframe\b[\s\S]*?\/>/g)) {
    const aparte = Object.keys(NO_SON_WEB).find((c) => m[0].includes(`"${c}"`));
    if (aparte) continue;
    marcos++;
    const linea = fuente.slice(0, m.index).split("\n").length;
    dice(/sandbox=\{SANDBOX_WEB\}/.test(m[0]), `${f}:${linea}: el iframe lleva sandbox={SANDBOX_WEB}`);
  }
}
dice(marcos >= 2, `hay iframes que mirar (${marcos}): si salen cero, este comprobador ya no ve el código`);

/* ── La CSP de la ventana ──────────────────────────────────────────────── */
// Sin ella, un XSS en la ventana llegaba a todos los comandos de Rust. La
// medida es de `csp-ventana.mjs`; aquí, que siga puesta y que no se afloje.
const csp = JSON.parse(leer("src-tauri/tauri.conf.json")).app.security.csp;
dice(csp && typeof csp === "object", "tauri.conf.json lleva CSP (no null)");
if (csp && typeof csp === "object") {
  const de = (d) => String(csp[d] ?? "");
  dice(de("script-src") === "'self'", `script-src es solo 'self' (${de("script-src")}): ni en línea, ni eval, ni de fuera`);
  dice(de("object-src") === "'none'", "object-src 'none'");
  dice(!!csp["default-src"] && !/\*|https?:(\s|$)/.test(de("default-src")), `default-src cerrado (${de("default-src")})`);
  dice(!/\*|https:(\s|$)|http:(\s|$)/.test(de("connect-src")), "connect-src no deja hablar con cualquier sitio");
  // La brújula de la Agenda habla con su Supabase desde la ventana.
  const brujula = leer("src/lib/brujula.ts").match(/const BASE = "([^"]+)"/)?.[1];
  dice(!!brujula && de("connect-src").includes(brujula), `connect-src deja a la brújula llegar a ${brujula}`);
  for (const d of ["img-src", "media-src"]) dice(de(d).includes("asset:") && de(d).includes("http://asset.localhost"), `${d} deja el protocolo asset: (el fondo) en Windows y en Linux`);
  dice(de("connect-src").includes("ipc:") && de("connect-src").includes("http://ipc.localhost"), "connect-src deja las llamadas a Rust en Windows y en Linux");
}

if (fallos) {
  console.error(`\n${fallos} fallo(s) en el blindaje de la ventana.`);
  process.exit(1);
}
console.log("\nLa ventana sigue blindada.");
