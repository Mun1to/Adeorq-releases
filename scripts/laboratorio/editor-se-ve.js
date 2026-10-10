// Abre el editor de archivos con código de verdad, para MIRARLO.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/editor-se-ve.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//   3. Hacer la captura: `page.screenshot({ path: ".playwright-mcp/editor.png", scale: "css" })`
//
// No comprueba nada: deja en pantalla tres archivos del propio repo (un `.ts`,
// un `.rs` y un `.md`) servidos por el doble, con la hoja del `.ts` delante.
// Sirve para juzgar los colores, la letra y las pestañas con los ojos, que es
// lo que ningún banco hace. Devuelve qué hay abierto.
async (page) => {
  const leer = async (ruta) => {
    // Lo que Vite sabe leer (`.ts`, `.js`) lo devuelve con `?raw` como un módulo,
    // `export default '…el texto…'`, con unas comillas u otras según el archivo:
    // se evalúa como lo que es. Lo que no (`.rs`, `.md`), tal cual está.
    const crudo = await (await fetch(`http://localhost:1420/${ruta}?raw`)).text();
    if (!crudo.startsWith("export default ")) return crudo;
    return (0, eval)(`(${crudo.split("\n")[0].replace(/^export default /, "").replace(/;\s*$/, "")})`);
  };
  const RAIZ = "C:\\proyectos\\Adeorq\\";
  const archivos = {
    [`${RAIZ}src\\lib\\alCerrar.ts`]: await leer("src/lib/alCerrar.ts"),
    [`${RAIZ}src-tauri\\src\\cierre.rs`]: await leer("src-tauri/src/cierre.rs"),
    [`${RAIZ}docs\\ARCHIVOS.md`]: await leer("docs/ARCHIVOS.md"),
  };
  await page.addInitScript((archivos) => {
    const rutas = Object.keys(archivos);
    localStorage.clear();
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    localStorage.setItem("adeorq-layout", JSON.stringify({
      panes: [{ name: "alCerrar.ts", cwd: "C:\\proyectos\\Adeorq", archivos: rutas, activo: rutas[0] }],
      cols: [{ w: 1, hs: [1], idx: [0] }],
    }));
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        case "cierre_puede_fondo": return true;
        case "leer_archivo": {
          const texto = archivos[args.ruta] ?? "";
          return { ruta: args.ruta, texto, pega: null, peso: texto.length, cuando: 100, crlf: false };
        }
        case "cuando_archivo": return 100;
        case "leer_imagen": return null;
        case "guardar_archivo": return { cuando: 101, pisaria: false };
        default:
          throw new Error(`sin doble: ${cmd}`);
      }
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: (cmd, args) => Promise.resolve().then(() => contestar(cmd, args)),
        transformCallback: (cb) => {
          const id = Math.floor(Math.random() * 1e9);
          window[`_${id}`] = cb;
          return id;
        },
        convertFileSrc: (r) => r,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      },
    });
  }, archivos);

  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="cabina"]').click();
  await page.locator(".ed-hoja[data-visible='true'] .cm-content").waitFor({ timeout: 10000 });
  // El navegador del MCP puede llevar zoom: se pide la ventana que da 1400 de página.
  const k = (await page.viewportSize()).width / (await page.evaluate(() => innerWidth));
  await page.setViewportSize({ width: Math.round(1400 * k), height: Math.round(760 * k) });
  await page.waitForTimeout(500);
  return page.evaluate(() => ({
    ancho: innerWidth,
    pestanas: [...document.querySelectorAll(".ed-pestana, .ed-tab")].map((p) => p.textContent.trim()),
    lineas: document.querySelectorAll(".ed-hoja[data-visible='true'] .cm-line").length,
  }));
}
