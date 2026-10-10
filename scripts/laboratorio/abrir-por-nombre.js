// Abrir un archivo por su nombre: Ctrl+P, o desde la paleta de Ctrl+K.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página.
//
// Deja una consola en un proyecto, siembra sus archivos (`window.__nombres`) y
// mira lo que las reglas (`scripts/abrir-por-nombre-check.ts`) no pueden ver:
//   · Fuera de una terminal, Ctrl+P abre la caja en modo archivos, con los
//     del proyecto que tienes delante.
//   · Escribir filtra; Enter abre ESE archivo, con su ruta entera de Windows.
//   · Dentro de una terminal, Ctrl+P NO abre nada: esa tecla es del programa.
//   · Desde Ctrl+K se llega igual: «Abrir un archivo por su nombre».
//   · Ctrl+P con la caja de archivos abierta la cierra; Ctrl+K la cambia de modo.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.addInitScript(() => {
    try {
      localStorage.setItem("adeorq-lateral", "archivos");
      localStorage.setItem("adeorq-layout", JSON.stringify({
        panes: [{ name: "Web · consola", cwd: "C:\\proyectos\\Web" }],
        cols: [{ w: 1, hs: [1], idx: [0] }],
        ocultos: [],
      }));
    } catch { /* sin almacenamiento */ }
  });
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(4000);
  await page.locator('[data-tab="cabina"]').first().click();
  await page.waitForTimeout(600);
  await page.locator("[data-pane-id]").first().click({ position: { x: 60, y: 60 } });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__nombres = ["README.md", "package.json", "web/App.tsx", "web/App.css", "web/lib/pty.ts", "docs/guia.md"];
  });
  const caja = page.locator(".paleta-caja");
  const filas = () => page.locator(".paleta-fila").evaluateAll((fs) => fs.map((f) => f.innerText.replace(/\s+/g, " ").trim()));
  const leidos = () => page.evaluate(() => window.__llamadas.filter(([c]) => c === "leer_archivo").map(([, a]) => a.ruta));

  // 1. Dentro de la terminal, Ctrl+P no es nuestro.
  await page.locator(".xterm").first().click();
  await page.keyboard.press("Control+p");
  await page.waitForTimeout(400);
  debe(await caja.count() === 0, "dentro de una terminal, Ctrl+P no abre la caja");

  // 2. Fuera, sí: en modo archivos y con los del proyecto.
  await page.locator(".arch-raiz").first().click();
  await page.keyboard.press("Control+p");
  await caja.waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  pasos.alAbrir = await filas();
  pasos.pide = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "listar_nombres").map(([, a]) => a.raiz).at(-1));
  debe(pasos.pide === "C:\\proyectos\\Web", `pide los archivos del proyecto que tienes delante («${pasos.pide}»)`);
  debe(pasos.alAbrir.length === 6 && pasos.alAbrir[0] === "package.json", `salen todos, los de arriba primero (${pasos.alAbrir})`);
  debe((await page.locator(".paleta-input").getAttribute("placeholder")) === "Qué archivo abro", "la caja dice qué busca");

  // 3. Escribir filtra, y Enter abre ese.
  await page.keyboard.type("app");
  await page.waitForTimeout(250);
  pasos.filtrado = await filas();
  debe(pasos.filtrado.join("|") === "App.css web|App.tsx web", `filtra por el nombre y enseña su carpeta (${pasos.filtrado.join("|")})`);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  pasos.abierto = (await leidos()).at(-1);
  debe(pasos.abierto === "C:\\proyectos\\Web\\web\\App.tsx", `abre el elegido con su ruta entera («${pasos.abierto}»)`);
  debe(await caja.count() === 0, "y la caja se cierra");

  // 4. Desde Ctrl+K: la entrada que lleva al modo archivos.
  await page.keyboard.press("Control+k");
  await caja.waitFor({ timeout: 3000 });
  await page.keyboard.type("abrir un archivo");
  await page.waitForTimeout(250);
  pasos.entrada = (await filas())[0];
  debe(/Abrir un archivo por su nombre/.test(pasos.entrada || "") && /Ctrl\+P/.test(pasos.entrada || ""), `la paleta lo ofrece con su atajo («${pasos.entrada}»)`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  debe(await caja.count() === 1 && (await page.locator(".paleta-input").inputValue()) === "", "pasa a archivos sin cerrarse, con la caja vacía");
  debe((await filas()).length === 6, "y salen los archivos");

  // 5. Ctrl+K con los archivos abiertos cambia de modo; Ctrl+P con ellos abiertos, cierra.
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  debe(await caja.count() === 1 && (await page.locator(".paleta-input").getAttribute("placeholder")) === "Qué quieres hacer", "Ctrl+K la devuelve a los comandos");
  await page.keyboard.press("Control+p");
  await page.waitForTimeout(400);
  debe((await page.locator(".paleta-input").getAttribute("placeholder")) === "Qué archivo abro", "y Ctrl+P, a los archivos");
  await page.keyboard.press("Control+p");
  await page.waitForTimeout(400);
  debe(await caja.count() === 0, "Ctrl+P otra vez la cierra");

  return { pasos, fallos };
}
