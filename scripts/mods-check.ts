// Los mods del usuario (META 14, `docs/contexto/mods.md`), probados sin la app.
//
//   pnpm bancos mods
//
// Dos cosas. La lógica de `src/lib/mods.ts`: cada mod contra lo que esta
// versión conoce, y la hoja que sale de todos. Y el CONTRATO: que los nombres
// por pieza de `PIEZAS` estén de verdad en la hoja de la app, con su escalón de
// reserva y sin que nadie los declare, porque a esos nombres se agarran los
// mods de la gente y un renombrado los suelta a todos sin romper nada a la vista.

import { PIEZAS, encargoDeMod, encargoDeRehacer, guiaDeMods, hojaDeLosMods, porqueNoCarga, repasar, resumenDeMods } from "../src/lib/mods";
import { makeT } from "../src/lib/i18n";
import type { Mod } from "../src/lib/mods";

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

const mod = (id: string, parte: Partial<Mod> = {}): Mod => ({
  id,
  nombre: id,
  pedido: "quiero los iconos redondos",
  hechoPara: "0.9.192",
  toca: ["--r-icono"],
  hoja: ":root { --r-icono: 999px; }",
  fallo: null,
  ...parte,
});

const CONOCIDAS = new Set(["--r-icono", "--accent", "--r-caja"]);
const existe = (v: string) => CONOCIDAS.has(v);

{
  const [m] = repasar([mod("iconos-redondos")], existe);
  caso("un mod que se agarra a algo que existe queda aplicado", m.estado === "aplicado" && m.sueltas.length === 0);
}
{
  const [m] = repasar([mod("viejo", { toca: ["--r-icono", "--r-avatar", "--ya-no"] })], existe);
  caso("el que toca algo que ya no existe no engancha, y dice qué", m.estado === "no_engancha" && m.sueltas.join(",") === "--r-avatar,--ya-no", m.sueltas.join(","));
}
{
  const [m] = repasar([mod("malo", { fallo: "la hoja lleva un @import", hoja: "", toca: ["--ya-no"] })], existe);
  caso("el que Rust rechazó queda rechazado y no se repasa", m.estado === "rechazado" && m.sueltas.length === 0);
}
{
  const [m] = repasar([mod("clases", { toca: [".pane-btn", "--accent"] })], existe);
  caso("lo que no es una variable no se da por suelto", m.estado === "aplicado");
}
{
  const [m] = repasar([mod("libre", { toca: [] })], existe);
  caso("sin nada declarado no hay nada que repasar", m.estado === "aplicado");
}

{
  const repasados = repasar(
    [
      mod("alfa", { hoja: ".pane { color: red; }\n" }),
      mod("malo", { fallo: "falta estilo.css", hoja: "" }),
      mod("viejo", { toca: ["--ya-no"], hoja: ":root { --ya-no: 1px; }" }),
      mod("hueco", { hoja: "   " }),
    ],
    existe,
  );
  const hoja = hojaDeLosMods(repasados);
  caso("la hoja lleva los que pasan, en su orden y con su nombre", hoja === "/* mod: alfa */\n.pane { color: red; }\n\n/* mod: viejo */\n:root { --ya-no: 1px; }", JSON.stringify(hoja));
  caso("el que ya no engancha se pone igual: puede tocar más cosas", hoja.includes("mod: viejo"));
  caso("el rechazado y el vacío no entran", !hoja.includes("malo") && !hoja.includes("hueco"));
  const resumen = resumenDeMods(repasados);
  caso("el rastro dice cuántos hay puestos y cuál falla", resumen === "mods: 3 puestos · viejo ya no engancha (--ya-no) · malo rechazado (falta estilo.css)", resumen);
}
caso("sin mods no hay hoja ni línea en el rastro", hojaDeLosMods([]) === "" && resumenDeMods([]) === "");

// Apagar uno a uno (Ajustes > Mods): sigue en su carpeta, pero no se pone.
{
  const repasados = repasar(
    [mod("alfa"), mod("beta", { toca: ["--ya-no"] }), mod("malo", { fallo: "falta estilo.css", hoja: "" })],
    existe,
    new Set(["alfa", "beta", "malo"]),
  );
  caso("el apagado queda apagado y no entra en la hoja", repasados[0].estado === "apagado" && hojaDeLosMods(repasados) === "");
  caso("de un apagado se sigue sabiendo lo que ya no engancha", repasados[1].estado === "apagado" && repasados[1].sueltas.join(",") === "--ya-no");
  caso("apagar uno que Adeorq no carga no lo arregla: sigue rechazado", repasados[2].estado === "rechazado");
  caso("el rastro cuenta los apagados", resumenDeMods(repasados) === "mods: 0 puestos · malo rechazado (falta estilo.css) · 2 apagados", resumenDeMods(repasados));
}

// ── La guía y los encargos: lo que le llega al agente ──────────────────────
{
  const carpeta = "C:\\Users\\tu\\AppData\\Local\\Adeorq\\mods";
  const guia = guiaDeMods("0.9.193", carpeta);
  caso("la guía dice dónde va un mod, con las barras de ese sistema", guia.includes(`${carpeta}\\<id>\\mod.json`) && guia.includes(`${carpeta}\\<id>\\estilo.css`));
  caso("en Linux, con las suyas", guiaDeMods("0.9.193", "/home/tu/.local/share/adeorq/mods").includes("/home/tu/.local/share/adeorq/mods/<id>/mod.json"));
  caso("la guía lleva la versión para la que se escribe", guia.includes('"hecho_para": "0.9.193"') && guia.includes("Adeorq 0.9.193"));
  for (const nombre of Object.keys(PIEZAS)) caso(`la guía nombra ${nombre}`, guia.includes(`\`${nombre}\``));
  caso("la guía dice lo que Rust no deja pasar", ["@import", "image-set()", "url()", "barra invertida", "256 KB"].every((x) => guia.includes(x)));
  caso("la guía no pesa más de lo que Rust le deja escribir", guia.length < 64 * 1024, `${guia.length} caracteres`);

  const ruta = `${carpeta}\\LEEME.md`;
  const nuevo = encargoDeMod(ruta);
  caso("el encargo de un mod nuevo es una línea y queda abierta", !nuevo.includes("\n") && nuevo.startsWith(`Lee ${ruta} `) && nuevo.endsWith("quiero "), nuevo);
  const [viejo, roto] = repasar(
    [mod("esquinas", { toca: ["--r-vieja"], pedido: "quiero   las esquinas\nmás redondas" }), mod("con-red", { fallo: "la hoja lleva un @import", hoja: "", pedido: "" })],
    existe,
  );
  const rehacer = encargoDeRehacer(viejo, ruta);
  caso("rehacer uno que no engancha dice cuál, qué se soltó y qué se pidió, en una línea", !rehacer.includes("\n") && rehacer.includes("«esquinas»") && rehacer.includes("--r-vieja ya no existe") && rehacer.includes("«quiero las esquinas más redondas»"), rehacer);
  const arreglar = encargoDeRehacer(roto, ruta);
  caso("rehacer uno que no se carga dice por qué, y sin pedido no inventa uno", arreglar.includes("no lo carga: la hoja lleva un @import") && !arreglar.includes("Lo que pedí"), arreglar);
}

// ── Las zonas que ningún mod toca ──────────────────────────────────────────
// `blindar` deja las reglas de los mods fuera de lo que lleve `data-sin-mods`;
// si una de estas raíces pierde la marca, un mod vuelve a poder esconderla.
// Lo que hace `blindar` en un navegador lo mide `scripts/laboratorio/mods-zonas.js`.
{
  const raiz = process.cwd();
  const leer = (f: string) => (require("fs") as { readFileSync(p: string, c: string): string }).readFileSync(`${raiz}/${f}`, "utf8");
  const ZONAS: Array<[string, string]> = [
    ["src/components/TerminalPane.tsx", '<div className="pane-ask" data-sin-mods="">'],
    ["src/components/SettingsView.tsx", '<section className="panel-card" data-sin-mods="">\n                <h2>{t("Modo de permisos")}</h2>'],
    ["src/components/AjustesMcp.tsx", '<section className="panel-card" data-sin-mods="">\n      <h2>{t("Qué puede hacer cada cliente por el MCP")}</h2>'],
    ["src/components/PedirSecreto.tsx", '<div className="modal-overlay" data-sin-mods=""'],
    ["src/components/AccountsView.tsx", '<div className="panel accounts" data-sin-mods="">'],
  ];
  for (const [f, marca] of ZONAS) {
    caso(`la zona de ${f.split("/").pop()} sigue marcada`, leer(f).replace(/\r\n/g, "\n").includes(marca));
  }
  caso("sin navegador, la hoja va tal cual (el banco no tiene CSSOM)", hojaDeLosMods(repasar([mod("a")], existe)) === "/* mod: a */\n:root { --r-icono: 999px; }");
}

// ── Por qué no se carga, en inglés ─────────────────────────────────────────
// Las frases las escribe `mods.rs`; si cambian allí y no aquí, el banco lo dice.
{
  const raiz = process.cwd();
  const rust = (require("fs") as { readFileSync(p: string, c: string): string }).readFileSync(`${raiz}/src-tauri/src/mods.rs`, "utf8");
  const en = makeT("en");
  const FIJAS = [
    "la hoja lleva una barra invertida: escribe el carácter tal cual, sin escapes",
    "la hoja lleva un @import: un mod no trae hojas de fuera",
    "la hoja lleva un image-set(): un mod no pide nada a la red",
    "la hoja lleva un url() que no es data: un mod no pide nada a la red",
    "falta mod.json",
    "mod.json no dice su tipo",
    "falta estilo.css",
  ];
  for (const f of FIJAS) {
    caso(`«${f.slice(0, 40)}…» sigue en mods.rs y tiene su inglés`, rust.includes(`"${f}"`) && porqueNoCarga(f, en) !== f, porqueNoCarga(f, en));
  }
  const CON_DATO: Array<[string, string]> = [
    ["estilo.css pesa más de 256 KB", "estilo.css is larger than 256 KB"],
    ["mod.json no es un archivo normal", "mod.json is not a regular file"],
    ["mod.json dice otro id que el de su carpeta (otro)", "mod.json gives a different id from its folder (otro)"],
    ["el tipo «codigo» no se carga: de momento solo «estilo»", "the type “codigo” is not loaded: for now only “estilo”"],
    ["mod.json no se entiende: expected value at line 1 column 1", "mod.json cannot be read: expected value at line 1 column 1"],
  ];
  for (const [es, ingles] of CON_DATO) caso(`«${es}» sale en inglés con su dato`, porqueNoCarga(es, en) === ingles, porqueNoCarga(es, en));
  caso("en español sale tal cual", porqueNoCarga("estilo.css pesa más de 256 KB", makeT("es")) === "estilo.css pesa más de 256 KB");
}

// ── El contrato, contra la hoja de verdad ──────────────────────────────────
{
  const raiz = process.cwd();
  const css = (require(raiz + "/scripts/hoja.cjs") as unknown as { hojaDeLaApp(r: string): string }).hojaDeLaApp(raiz);
  const ESCALA = "(?:chico|btn|caja|pastilla)";

  // La reserva es un escalón, o una forma de cuatro esquinas hecha de escalones
  // y de detalles a mano (el avatar pegado a su fila: «var(--r-btn) 3px 3px
  // var(--r-btn)»). Lo que no vale es una pieza que no se sepa a qué vuelve.
  const RESERVA = `(?:var\\(--r-${ESCALA}\\)|\\d+px)(?:\\s+(?:var\\(--r-${ESCALA}\\)|\\d+px))*`;
  for (const nombre of Object.keys(PIEZAS)) {
    const usos = css.match(new RegExp(`var\\(${nombre},`, "g")) ?? [];
    const conReserva = css.match(new RegExp(`var\\(${nombre},\\s*${RESERVA}\\)`, "g")) ?? [];
    caso(`${nombre} está en la hoja`, usos.length > 0, `${usos.length} usos`);
    caso(`${nombre} lleva siempre una reserva hecha de la escala`, conReserva.length === usos.length, `${conReserva.length} de ${usos.length}`);
    caso(`${nombre} no lo declara nadie: sin mods no cambia nada`, !new RegExp(`(^|[;{\\s])${nombre}\\s*:`).test(css));
    const pelados = css.match(new RegExp(`var\\(${nombre}\\)`, "g")) ?? [];
    caso(`${nombre} nunca va sin reserva`, pelados.length === 0, `${pelados.length} sin reserva`);
  }

  // Una esquina con reserva que no esté en la lista es una pieza con nombre que
  // nadie apuntó: quien escriba un mod no sabrá que existe.
  // (Los cuatro escalones no cuentan: hay un `var(--r-caja, 10px)` de antes.)
  const enLaHoja = new Set([...css.matchAll(/var\((--r-[a-z0-9-]+),/g)].map((m) => m[1]));
  const escalones = new RegExp(`^--r-${ESCALA}$`);
  const sinApuntar = [...enLaHoja].filter((n) => !(n in PIEZAS) && !escalones.test(n));
  caso("toda pieza con nombre de la hoja está en PIEZAS", sinApuntar.length === 0, sinApuntar.join(", "));

  // Las familias de botones de solo icono, medidas con la interfaz de verdad el
  // 2026-10-12. Si una pierde el nombre, el mod «iconos redondos» de alguien
  // deja de alcanzarla sin que nada falle. `.usage-cliente` salió el
  // 2026-10-17 con el Uso viejo (el que elegía programa y cuenta): el Uso de
  // ahora enseña todas las cuentas a la vez y su único botón es un `.mini`.
  const CON_ICONO = [
    ".tab",
    ".mini",
    ".pane-close",
    ".pane-btn",
    ".franja-btn",
    ".campana",
    ".cb-tool",
    ".canvas-flow .react-flow__controls-button",
  ];
  for (const selector of CON_ICONO) {
    const limpio = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lleva = new RegExp(`(^|\\n)${limpio}\\s*\\{[^}]*border-radius:\\s*var\\(--r-icono,`).test(css);
    caso(`${selector} lleva --r-icono`, lleva);
  }

  // Y los avatares de proyecto, que NO son iconos (decidido el 2026-10-12): un
  // mod los redondea aparte. Los dos pegados a su fila guardan su forma de
  // cuatro esquinas como reserva, y con el mod puesto salen redondos del todo.
  const CON_AVATAR = [
    ".pavatar",
    ".project-mark .pavatar",
    '.project[data-open="true"] .project-mark .pavatar',
    '.projects[data-rail="tira"] .project-logo',
    ".project-logo",
    ".pavatar.pavatar-xl",
    ".pavatar.pavatar-pick",
    ".pavatar.pavatar-mini",
  ];
  for (const selector of CON_AVATAR) {
    const limpio = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lleva = new RegExp(`(^|\\n)${limpio}\\s*\\{[^}]*border-radius:\\s*var\\(--r-avatar,`).test(css);
    caso(`${selector} lleva --r-avatar`, lleva);
  }
}

if (fallos) {
  console.error(`\n${fallos} caso(s) MAL`);
  process.exit(1);
}
console.log("\ntodo bien");
