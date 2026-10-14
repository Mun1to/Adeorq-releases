// Lanza los guiones del banco de la interfaz (los `async (page) => {}` de esta
// carpeta) con un Brave propio y un perfil de usar y tirar, sin el MCP de
// Playwright.
//
// Para cuando el Brave del MCP lo tiene cogido otra sesión («Browser is already
// in use for …playwright-brave»): aquí trabajan varias a la vez y ese Brave no
// se cierra, porque es suyo (regla AM). Este no comparte nada con aquel.
//
//   node scripts/laboratorio/banco-sin-mcp.mjs <guion> [<guion>...]
//
// Los guiones se ejecutan en orden sobre la MISMA página, como con el MCP: el
// doble primero (`doble-conserje.js`) y después el banco. Sale con 1 si alguno
// devuelve `fallos` con algo dentro o revienta. Usa el `playwright-core` que el
// MCP ya se descargó en la caché de npx: no instala nada.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";

function playwrightCore() {
  const npx = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const d of existsSync(npx) ? readdirSync(npx) : []) {
    const p = join(npx, d, "node_modules", "playwright-core");
    if (existsSync(join(p, "package.json"))) return p;
  }
  throw new Error(`no encuentro playwright-core en ${npx}: abre una vez el MCP de Playwright para que se lo descargue`);
}

const guiones = process.argv.slice(2);
if (!guiones.length) {
  console.error("uso: node scripts/laboratorio/banco-sin-mcp.mjs <guion> [<guion>...]");
  process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(playwrightCore());
const perfil = mkdtempSync(join(tmpdir(), "banco-brave-"));
const ctx = await chromium.launchPersistentContext(perfil, { executablePath: BRAVE, headless: true, viewport: { width: 1440, height: 900 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
let salida = 0;
try {
  for (const guion of guiones) {
    const fn = (0, eval)(`(${readFileSync(guion, "utf8")})`);
    const r = await fn(page);
    console.log(`── ${guion}`);
    console.log(JSON.stringify(r, null, 1));
    if (r && Array.isArray(r.fallos) && r.fallos.length) salida = 1;
  }
} catch (e) {
  console.error(e);
  salida = 1;
} finally {
  await ctx.close();
  rmSync(perfil, { recursive: true, force: true });
}
process.exit(salida);
