// Lo que tiene que seguir cierto para que Adeorq salga bien en un Mac SIN estropear Windows.
//
//     node scripts/mac-check.mjs        (va dentro de `pnpm comprobar`)
//
// Es la red barata de `docs/contexto/mac.md`: no abre ningún Mac, mira que nadie
// haya deshecho a ojo lo que el Mac necesita ni lo que Windows ya tenía.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
let fallos = 0;
const dice = (bien, que) => {
  console.log(`${bien ? "ok  " : "MAL "} ${que}`);
  if (!bien) fallos++;
};

const conf = JSON.parse(leer("src-tauri/tauri.conf.json"));

/* ── La ventana: Windows queda como estaba ─────────────────────────────── */
// Windows coge el PRIMER efecto que conoce. Mientras `acrylic` vaya primero y sea
// el único suyo, el cristal de Windows es el de siempre; lo que se añade detrás
// es de macOS.
const efectos = conf.app.windows[0].windowEffects?.effects ?? [];
dice(efectos[0] === "acrylic", `el primer efecto de la ventana es acrylic (${efectos.join(", ")}): el cristal de Windows no cambia`);
const DE_WINDOWS = ["mica", "micaDark", "micaLight", "blur", "tabbed", "tabbedDark", "tabbedLight"];
dice(!efectos.slice(1).some((e) => DE_WINDOWS.includes(e)), "los efectos que se añaden detrás no son de Windows (Windows cogería el primero y no se notaría)");
dice(efectos.includes("hudWindow"), "y hay uno de macOS (hudWindow): sin él la ventana del Mac sería transparente sin desenfoque");
dice(conf.app.windows[0].transparent === true, "la ventana sigue transparente");

/* ── Los datos del Mac caen donde el protocolo de assets llega ──────────── */
dice(
  (conf.app.security.assetProtocol?.scope ?? []).includes("$LOCALDATA/Adeorq/**"),
  "assetProtocol.scope cubre $LOCALDATA/Adeorq/**, que en macOS es ~/Library/Application Support/Adeorq (mac::datos_en)",
);

/* ── El paquete firmado ─────────────────────────────────────────────────── */
const mac = conf.bundle.macOS ?? {};
dice(mac.hardenedRuntime === true, "bundle.macOS.hardenedRuntime: la notarización lo exige");
dice(mac.signingIdentity === "-", 'bundle.macOS.signingIdentity "-": ad-hoc sin secretos; con ellos manda APPLE_SIGNING_IDENTITY (preparar-firma.sh)');
dice(typeof mac.entitlements === "string" && existsSync(join(RAIZ, "src-tauri", mac.entitlements)), "el fichero de entitlements existe");
dice(/com\.apple\.security\.device\.audio-input/.test(leer("src-tauri/Entitlements.plist")), "los entitlements llevan el micrófono: sin él macOS da silencio a la dictación");
dice(!/allow-jit|allow-unsigned-executable-memory|disable-library-validation/.test(leer("src-tauri/Entitlements.plist").replace(/<!--[\s\S]*?-->/g, "")), "y no llevan permisos de más (JIT, memoria ejecutable, librerías de terceros)");
const info = leer("src-tauri/Info.plist");
for (const clave of ["NSMicrophoneUsageDescription", "NSDesktopFolderUsageDescription", "NSDocumentsFolderUsageDescription", "NSDownloadsFolderUsageDescription"]) {
  dice(info.includes(`<key>${clave}</key>`), `Info.plist lleva ${clave}`);
}
for (const idioma of ["en", "es"]) {
  const origen = mac.files?.[`Resources/${idioma}.lproj/InfoPlist.strings`];
  dice(typeof origen === "string" && existsSync(join(RAIZ, "src-tauri", origen)), `${idioma}.lproj/InfoPlist.strings está en bundle.macOS.files y existe`);
}

/* ── El workflow ────────────────────────────────────────────────────────── */
const flujo = leer(".github/workflows/macos.yml");
const sinComentarios = flujo.replace(/^\s*#.*$/gm, "");
dice(/runs-on:\s*macos-15\b/.test(sinComentarios) && !/macos-14/.test(sinComentarios), "corre en macos-15 (GitHub retira macos-14 el 2026-11-02)");
dice(/esperar-linux:/.test(flujo) && /needs:\s*\[comprobar,\s*esperar-linux\]/.test(flujo), "empaquetar espera a esperar-linux: los dos reescriben latest.json y a la vez uno pisaría al otro");
dice(/--workflow linux\.yml/.test(flujo), "y esperar-linux mira el workflow linux.yml");
dice(/github\.repository == 'Mun1to\/Adeorq-releases'/.test(flujo), "publicar solo en el repo público");
dice(/branches:\s*\[ci\/macos\]/.test(flujo), "el push solo dispara en ci/macos");
for (const script of flujo.match(/scripts\/macos\/[\w.-]+/g) ?? []) {
  dice(existsSync(join(RAIZ, script)), `el workflow llama a ${script} y existe`);
}

/* ── La web: el botón de Mac no puede verse antes de tiempo ─────────────── */
const portada = leer("web/index.html");
const boton = portada.match(/<a[^>]*data-en="descarga\.btnMac"[^>]*>/)?.[0];
dice(Boolean(boton), "la web lleva el botón de Mac");
if (boton) {
  dice(/\shidden(\s|>|=)/.test(boton), "y está oculto: nada de Mac se enseña hasta que una release lleve el DMG (docs/contexto/mac.md, «Encender el botón»)");
  dice(leer("web/portada/en.mjs").includes("'descarga.btnMac'"), "tiene su texto en inglés");
}

console.log(fallos ? `\n${fallos} MAL.` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
