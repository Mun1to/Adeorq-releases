// «Informar de un problema con Adeo» (política 11.16 de la Microsoft Store): la
// dirección que abre el botón, sin ninguna incidencia de verdad.
//
//   pnpm bancos informar
//
// Existe por tres cosas que no se ven mirando el botón:
//
//  1. Que la dirección sea la de una incidencia NUEVA del repo público, con el
//     título y la plantilla ya escritos, y que NO lleve `labels=`: según la
//     documentación de GitHub, un parámetro sin el permiso que pide devuelve un
//     404, y quien informa no tiene permiso de clasificar nada en nuestro repo.
//  2. Que no lleve la conversación: la incidencia es pública. Ni la función
//     recibe nada de la conversación, ni el componente toca un turno.
//  3. Que la página del móvil (`movil.html`, con su propia copia de la función en
//     JavaScript y su propio diccionario) dé EXACTAMENTE la misma dirección que
//     el PC, en español y en inglés. Se saca el trozo marcado de la página y se
//     ejecuta de verdad.

import { CORREO, correoDelInforme, direccionDelInforme, INCIDENCIAS, type DondeInforma } from "../src/lib/informar";

declare const require: (m: string) => { readFileSync(p: string, e: string): string };

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? `: ${detalle}` : ""}`);
}

const DONDES: DondeInforma[] = ["chat", "plan", "enjambre", "movil", "modelo", "inicio"];
const { readFileSync } = require("node:fs");

// ─── 1. La dirección ────────────────────────────────────────────────────────
for (const ingles of [false, true]) {
  const idioma = ingles ? "EN" : "ES";
  for (const donde of DONDES) {
    const u = direccionDelInforme({ version: "0.9.243", ingles, donde });
    const url = new URL(u);
    const nombre = `${idioma} ${donde}`;
    ok(`${nombre}: es una incidencia nueva del repo público`, `${url.origin}${url.pathname}` === INCIDENCIAS && url.hostname === "github.com" && url.pathname === "/Mun1to/Adeorq-releases/issues/new");
    ok(`${nombre}: sin labels (un 404 para quien no clasifica)`, !url.searchParams.has("labels") && !/labels/i.test(u));
    ok(`${nombre}: solo title y body`, url.search.slice(1).split("&").map((x) => x.split("=")[0]).sort().join(",") === "body,title");
    const cuerpo = url.searchParams.get("body") ?? "";
    ok(`${nombre}: lleva la versión`, cuerpo.includes("0.9.243"));
    ok(`${nombre}: avisa de que es público`, ingles ? /public/i.test(cuerpo) : /pública/.test(cuerpo));
    ok(`${nombre}: el título pide cosas distintas en cada idioma`, (url.searchParams.get("title") ?? "").length > 10);
    ok(`${nombre}: cabe en una dirección`, u.length < 2000, String(u.length));
    ok(`${nombre}: sin rayas largas ni cortas`, !/[–—]/.test(cuerpo + (url.searchParams.get("title") ?? "")));
  }
}
ok("sin versión, la plantilla lo dice y no pone «undefined»", !/undefined|null/.test(direccionDelInforme({ version: "", ingles: false, donde: "chat" })) && decodeURIComponent(direccionDelInforme({ version: "", ingles: false, donde: "chat" })).includes("no la sé"));
ok("el español y el inglés no son lo mismo", direccionDelInforme({ version: "1", ingles: false, donde: "chat" }) !== direccionDelInforme({ version: "1", ingles: true, donde: "chat" }));

// ─── 1b. El correo, para quien no tiene cuenta de GitHub ────────────────────
// Una incidencia exige cuenta de GitHub; sin otro medio, quien no la tiene no
// puede informar (11.16). El `mailto:` lleva el asunto ya escrito, no avisa de
// que sea público (no lo es) y no lleva la conversación.
ok("el correo es el de contacto público que dio Munir", CORREO === "munitodev@gmail.com", CORREO);
for (const ingles of [false, true]) {
  const idioma = ingles ? "EN" : "ES";
  for (const donde of DONDES) {
    const u = correoDelInforme({ version: "0.9.243", ingles, donde });
    const nombre = `${idioma} ${donde} por correo`;
    const m = /^mailto:([^?]+)\?(.*)$/.exec(u);
    const params = new URLSearchParams(m?.[2] ?? "");
    ok(`${nombre}: es un mailto: al correo de contacto`, !!m && m[1] === CORREO, u.slice(0, 60));
    ok(`${nombre}: solo subject y body (nadie en copia)`, [...params.keys()].sort().join(",") === "body,subject");
    const asunto = params.get("subject") ?? "";
    const cuerpo = params.get("body") ?? "";
    ok(`${nombre}: lleva el asunto ya escrito`, asunto.length > 10 && (ingles ? /Report an issue/.test(asunto) : /Informe de un problema/.test(asunto)), asunto);
    ok(`${nombre}: lleva la versión y el sitio`, cuerpo.includes("0.9.243") && cuerpo.split("\r\n").length >= 4);
    ok(`${nombre}: texto plano (un correo no pinta el markdown)`, !/\*\*/.test(cuerpo));
    ok(`${nombre}: no dice que sea público (no lo es)`, !(ingles ? /public/i : /pública/).test(cuerpo));
    ok(`${nombre}: sin rayas largas ni cortas`, !/[–—]/.test(asunto + cuerpo));
    ok(`${nombre}: cabe en un mailto`, u.length < 1500, String(u.length));
    if (donde === "modelo") ok(`${nombre}: ni el asunto ni el cuerpo dicen Adeo`, !/\badeo\b/i.test(`${asunto} ${cuerpo}`), `${asunto} ${cuerpo}`.match(/.{0,30}\badeo\b.{0,30}/i)?.[0] ?? "");
  }
}
ok("sin versión, el correo lo dice y no pone «undefined»", !/undefined|null/.test(correoDelInforme({ version: "", ingles: false, donde: "chat" })) && decodeURIComponent(correoDelInforme({ version: "", ingles: false, donde: "chat" })).includes("no la sé"));

// ─── 2. La conversación no sale ─────────────────────────────────────────────
// La función solo recibe la versión, el idioma y el sitio. Y el componente no
// toca ningún turno: si un día alguien le pasa lo que dijo Adeo, esto se pone rojo.
const componente = readFileSync("src/components/Informar.tsx", "utf8");
ok("el componente no mira turnos ni textos de la conversación", !/\bturno\b|\.texto\b|conv\b|conversaci[oó]n\./i.test(componente.replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")));
const declaracion = readFileSync("src/lib/informar.ts", "utf8").match(/export interface Informe \{[\s\S]*?\n\}/)?.[0] ?? "";
ok("el Informe solo tiene versión, idioma y sitio", /version/.test(declaracion) && /ingles/.test(declaracion) && /donde/.test(declaracion) && (declaracion.match(/^\s+\w+:/gm) ?? []).length === 3, declaracion.replace(/\s+/g, " "));

// ─── 2b. El chat con un modelo del lienzo no es Adeo ────────────────────────
// En `CanvasChat.tsx` contesta el modelo que eligió la persona por su clave de
// OpenRouter. La frase, el título y la plantilla no pueden decir «Adeo» ahí, y la
// pieza tiene que llevar la línea y un botón por respuesta con ese sitio.
for (const ingles of [false, true]) {
  const url = new URL(direccionDelInforme({ version: "0.9.243", ingles, donde: "modelo" }));
  const texto = `${url.searchParams.get("title")} ${url.searchParams.get("body")}`;
  ok(`${ingles ? "EN" : "ES"} modelo: ni el título ni la plantilla dicen Adeo`, !/\badeo\b/i.test(texto), texto.match(/.{0,30}\badeo\b.{0,30}/i)?.[0] ?? "");
  ok(`${ingles ? "EN" : "ES"} modelo: el sitio es otro que el del Chat de Adeo`, texto !== `${new URL(direccionDelInforme({ version: "0.9.243", ingles, donde: "chat" })).searchParams.get("title")} ${new URL(direccionDelInforme({ version: "0.9.243", ingles, donde: "chat" })).searchParams.get("body")}`);
}
const sinComentarios = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
const fraseModelo = sinComentarios(componente).match(/donde === "modelo" \? t\("([^"]+)"\)/)?.[1] ?? "";
ok("la frase del chat con un modelo existe y no nombra a Adeo", fraseModelo.length > 10 && !/\badeo\b/i.test(fraseModelo), fraseModelo);
const diccionario = readFileSync("src/lib/i18n.ts", "utf8");
const enFrase = diccionario.match(new RegExp(`"${fraseModelo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*"([^"]+)"`))?.[1] ?? "";
ok("y tiene su inglés, que tampoco nombra a Adeo", enFrase.length > 10 && !/\badeo\b/i.test(enFrase), enFrase);
const canvasChat = sinComentarios(readFileSync("src/components/CanvasChat.tsx", "utf8"));
ok("CanvasChat lleva la línea bajo la caja", /<AvisoIA donde="modelo"/.test(canvasChat));
ok("y el botón junto a cada respuesta del modelo (no junto a lo tuyo)", /m\.role === "assistant" && <BotonInformar donde="modelo"/.test(canvasChat));
ok("y en ningún sitio lo declara como el Chat de Adeo", !/donde="(chat|plan|enjambre|movil)"/.test(canvasChat));

// ─── 2c. El correo va en la línea de debajo de la caja, no junto a cada respuesta
const sinCom = sinComentarios(componente);
const botonInformar = sinCom.match(/export function BotonInformar[\s\S]*?\n\}/)?.[0] ?? "";
const avisoIA = sinCom.match(/export function AvisoIA[\s\S]*?\n\}/)?.[0] ?? "";
ok("el botón de cada respuesta no lleva el correo (discreto: solo bajo la caja)", botonInformar.length > 50 && !/Correo|correo|mailto/.test(botonInformar));
// El espacio de por medio importa: sin él un lector de pantalla lee «problemao por correo».
ok("la línea de debajo de la caja sí lleva el correo, después del botón y con un espacio de por medio", /<BotonInformar donde=\{donde\} \/>\s*\{" "\}\s*<BotonCorreo donde=\{donde\} \/>/.test(avisoIA));
ok("el botón del correo abre un mailto: armado por la misma función que prueba este banco", /openUrl\(correoDelInforme\(\{ version, ingles, donde \}\)\)/.test(sinCom));
ok("y se llama «o por correo», con su inglés", /t\("o por correo"\)/.test(sinCom) && /"o por correo":\s*"or by email"/.test(diccionario));
ok("y la ayuda del botón dice la dirección (sin un programa de correo, el clic no abre nada)", /\{ correo: CORREO \}/.test(sinCom) && /\{correo\}/.test(diccionario.match(/"Abre tu programa de correo[^"]*":\s*\n?\s*"[^"]+"/)?.[0] ?? ""));
// La primera pantalla: la caja de Adeo del Panel (`PanelPedir.tsx`) es lo primero que ve quien abre la
// app, y desde ahí se le habla a Adeo. Sin la línea ni el botón ahí, quien revisa cae en el agujero de VoCript
// (el botón «a tres clics» y sin verse con la app recién instalada). Medido con la app: `recorrido-del-probador.mjs`.
const panelPedir = sinComentarios(readFileSync("src/components/PanelPedir.tsx", "utf8"));
ok("la caja de Adeo de la primera pantalla lleva la línea de IA y el botón, sin haber escrito nada", /<AvisoIA donde="inicio" \/>/.test(panelPedir) && /import \{ AvisoIA \} from "\.\/Informar"/.test(panelPedir));
// La dirección vive en un solo sitio del PC (`informar.ts`) y en uno del móvil.
const direcciones = (readFileSync("src/lib/informar.ts", "utf8").match(/munitodev@gmail\.com/g) ?? []).length;
ok("la dirección de correo se escribe una vez en informar.ts", direcciones === 1, String(direcciones));

// ─── 3. El móvil da la misma dirección ──────────────────────────────────────
// Con saltos de Linux: un clon o un worktree nuevo en Windows la saca con `\r\n`
// (core.autocrlf), y las marcas de abajo se buscan con `\n`.
const pagina = readFileSync("src-tauri/src/movil.html", "utf8").replace(/\r\n/g, "\n");
const trozo = pagina.split("// informar:inicio\n")[1]?.split("// informar:fin")[0] ?? "";
ok("la página del móvil lleva su función marcada", trozo.includes("function direccionDelInforme"));
// El diccionario inglés de la página, ejecutado tal cual.
const ini = pagina.indexOf("const EN = {");
const fin = pagina.indexOf("\n};", ini);
ok("y su diccionario inglés", ini > 0 && fin > ini);
const EN: Record<string, string> = new Function(`${pagina.slice(ini, fin + 3)}; return EN;`)();
const armar = (ingles: boolean): { incidencia: (v: string) => string; correo: (v: string) => string } => {
  const tr = (t: string) => (ingles && Object.prototype.hasOwnProperty.call(EN, t) ? EN[t] : t);
  return new Function("tr", `${trozo}; return { incidencia: direccionDelInforme, correo: correoDelInforme };`)(tr);
};
for (const ingles of [false, true]) {
  for (const version of ["0.9.243", ""]) {
    const movil = armar(ingles).incidencia(version);
    const pc = direccionDelInforme({ version, ingles, donde: "movil" });
    ok(`el móvil y el PC dan la misma dirección (${ingles ? "EN" : "ES"}, versión ${version || "vacía"})`, movil === pc, movil === pc ? "" : `\n  móvil ${movil}\n  PC    ${pc}`);
    const correoMovil = armar(ingles).correo(version);
    const correoPc = correoDelInforme({ version, ingles, donde: "movil" });
    ok(`y el mismo correo (${ingles ? "EN" : "ES"}, versión ${version || "vacía"})`, correoMovil === correoPc, correoMovil === correoPc ? "" : `\n  móvil ${correoMovil}\n  PC    ${correoPc}`);
  }
}
// El móvil: el correo va solo en la línea de debajo de la caja, y el aviso de versión
// no pisa el enlace del correo con el de la incidencia.
const avisoMovil = pagina.match(/function avisoIA\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
ok("la página del móvil pone el correo en la línea de debajo de la caja", /enlaceInformar\(""\)\} \$\{enlaceCorreo\(\)\}/.test(avisoMovil));
ok("y no junto a cada respuesta", !/enlaceCorreo/.test(pagina.match(/html \+= `<div class="turno[^\n]*/)?.[0] ?? "") && /enlaceCorreo/.test(pagina));
ok("y al llegar la versión se actualizan los dos enlaces por separado", /a\.informar:not\(\.por-correo\)/.test(pagina) && /a\.por-correo[^\n]*correoDelInforme\(versionDeAdeorq\)/.test(pagina));
ok("el correo del móvil es el mismo que el del PC", (pagina.match(/const CORREO = "([^"]+)"/)?.[1] ?? "") === CORREO);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
if (fallos) process.exit(1);
