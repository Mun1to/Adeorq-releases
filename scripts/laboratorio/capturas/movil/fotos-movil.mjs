// Las fotos del móvil, en los dos idiomas: la portada con lo que te espera y el
// conserje después de pedirle dos trabajos (las dos de «En tu móvil» en
// adeorq.com), y el cajón de la izquierda abierto (la tercera del README). Es la página de verdad (`src-tauri/src/movil.html`) servida por
// `doble-sam.mjs` con el taller de Sam, a 390 × 844 y escala 1,5, que es justo
// el 585 × 1266 que pide `web/index.html`.
//
//   node scripts/laboratorio/capturas/movil/fotos-movil.mjs
//
// Escribe en `web/assets/screens/<es|en>/phone-home.png`, `phone-concierge.png`
// y `phone-menu.png`.
// Lanza y para él mismo un doble por idioma (4392 y 4393): con `node … &` y el
// `kill` de Git Bash el doble seguía vivo horas después y la foto siguiente
// salía contra uno viejo. Usa Brave sin ventana y un perfil de usar y tirar,
// como `scripts/laboratorio/banco-sin-mcp.mjs`, con el `playwright-core` de la
// caché de npx.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..", "..", "..");
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const npx = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
const core = readdirSync(npx).map((d) => join(npx, d, "node_modules", "playwright-core")).find((p) => existsSync(join(p, "package.json")));
if (!core) throw new Error(`No hay playwright-core en ${npx}: lanza una vez «npx playwright --version».`);
const { chromium } = createRequire(import.meta.url)(core);

// Con nombres detrás solo hace esas fotos: `fotos-movil.mjs phone-menu`.
const SOLO = process.argv.slice(2);

const PEDIDO = {
  es: "Antes del viernes: que el descuento redondee bien y que la portada tenga modo oscuro.",
  en: "Before Friday: the discount has to round properly and the landing page needs a dark mode.",
};

// Arranca el doble y espera a que conteste, o falla si el puerto ya lo tiene otro.
async function doble(idioma, puerto) {
  const hijo = spawn(process.execPath, [join(AQUI, "doble-sam.mjs"), String(puerto)], {
    env: { ...process.env, IDIOMA: idioma },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let error = "";
  hijo.stderr.on("data", (d) => (error += d));
  for (let i = 0; i < 50; i++) {
    if (hijo.exitCode !== null) throw new Error(`El doble (${idioma}) no arrancó: ${error.trim()}`);
    const vivo = await fetch(`http://127.0.0.1:${puerto}/`).then((r) => r.ok, () => false);
    if (vivo) return hijo;
    await new Promise((r) => setTimeout(r, 100));
  }
  hijo.kill();
  throw new Error(`El doble (${idioma}) no contesta en el ${puerto}.`);
}

for (const [idioma, puerto] of [["es", 4392], ["en", 4393]]) {
  const B = `http://127.0.0.1:${puerto}`;
  const salida = join(RAIZ, "web", "assets", "screens", idioma);
  const hijo = await doble(idioma, puerto);
  const perfil = mkdtempSync(join(tmpdir(), "fotos-movil-"));
  const ctx = await chromium.launchPersistentContext(perfil, {
    executablePath: BRAVE,
    headless: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1.5,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    locale: idioma === "en" ? "en-US" : "es-ES",
  });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.goto(`${B}/`);
    await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));
    const AUT = { Authorization: "Bearer clave-de-mentira" };
    await page.request.post(`${B}/api/enviar`, { headers: AUT, data: { id: "c1", texto: PEDIDO[idioma] } });
    // El doble contesta a los tres segundos y abre las dos sesiones.
    await page.waitForTimeout(3600);

    const foto = async (hash, espera, nombre, antes) => {
      if (SOLO.length && !SOLO.includes(nombre.replace(/\.png$/, ""))) return;
      await page.goto("about:blank");
      await page.goto(`${B}/${hash}`);
      await page.waitForSelector(espera, { timeout: 10000 });
      // Las vistas entran con movimiento: se espera a que acabe.
      await page.waitForTimeout(1600);
      if (antes) await antes();
      await page.screenshot({ path: join(salida, nombre) });
      console.log(`${idioma}/${nombre}`);
    };
    await foto("", "#portada-term .fila-t", "phone-home.png");
    await foto("#conv=c1", "#hilo .turno", "phone-concierge.png");
    // El cajón de la izquierda abierto encima de esa conversación, que sale
    // marcada en su proyecto: lo que ves al tocar el botón de arriba.
    await foto("#conv=c1", "#hilo .turno", "phone-menu.png", async () => {
      await page.click("#abrir-cajon");
      await page.waitForSelector(".cajon .recientes .proyecto", { timeout: 10000 });
      await page.waitForTimeout(1200);
    });
    if (errores.length) throw new Error(`La página dio errores (${idioma}): ${errores.join(" | ")}`);
  } finally {
    await ctx.close();
    rmSync(perfil, { recursive: true, force: true });
    hijo.kill();
  }
}
