// Crear, renombrar y mandar a la papelera desde el clic derecho del árbol de
// Archivos (`ArchivosPanel.tsx`, `archivos.rs`).
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página. Lo que fija:
//   · en una carpeta: «Archivo nuevo…» y «Carpeta nueva…»; en una fila además
//     «Renombrar…» y «Mandar a la papelera»; en la raíz no se renombra ni se tira;
//   · el nombre se escribe en su sitio del árbol, debajo de la carpeta, y con
//     Intro nace, se abre en el editor y sale en el árbol;
//   · un nombre que ya existe no pisa nada: el campo se queda con el porqué;
//   · Esc lo deja sin crear nada;
//   · renombrar llega con el nombre seleccionado sin la extensión;
//   · la papelera lo quita del árbol y va a la papelera, no a la nada.
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
  const raiz = await page.locator(".arch-raiz").first().getAttribute("data-tip");
  await page.evaluate((R) => {
    window.__carpetas = {
      [R]: [{ nombre: "web", carpeta: true }, { nombre: "LICENSE", cuando: 1 }],
      [`${R}\\web`]: [{ nombre: "App.tsx", cuando: 1 }, { nombre: "viejo.md", cuando: 1 }],
    };
    window.__git = { git: true, cambios: [] };
  }, raiz);
  await page.locator('.franja-btn[data-tip="Ocultar panel"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.franja-btn[data-tip="Archivos"]').first().click();
  await page.waitForTimeout(1500);

  const nombres = () => page.evaluate(() => [...document.querySelectorAll(".arch-fila .arch-nom")].map((x) => x.textContent));
  const menu = async (texto) => {
    const fila = texto ? page.locator(".arch-fila", { hasText: texto }).first() : page.locator(".arch-raiz").first();
    await fila.click({ button: "right" });
    await page.locator(".ctx-menu").waitFor({ timeout: 3000 });
    return (await page.locator(".ctx-menu").innerText()).replace(/\s+/g, " ");
  };
  const elegir = (texto) => page.locator(".ctx-menu").getByText(texto, { exact: false }).first().click();

  // 1. Qué ofrece cada menú.
  const enCarpeta = await menu("web");
  debe(/Archivo nuevo/.test(enCarpeta) && /Carpeta nueva/.test(enCarpeta) && /Renombrar/.test(enCarpeta) && /papelera/.test(enCarpeta), `el menú de una carpeta (${enCarpeta})`);
  await page.keyboard.press("Escape");
  const enArchivo = await menu("LICENSE");
  debe(!/Archivo nuevo/.test(enArchivo) && /Renombrar/.test(enArchivo) && /papelera/.test(enArchivo), `el de un archivo (${enArchivo})`);
  await page.keyboard.press("Escape");
  const enRaiz = await menu(null);
  debe(/Archivo nuevo/.test(enRaiz) && !/Renombrar/.test(enRaiz) && !/papelera/.test(enRaiz), `el de la raíz: crear sí, renombrar y tirar no (${enRaiz})`);
  await page.keyboard.press("Escape");

  // 2. Un archivo nuevo dentro de «web», plegada: se despliega y el campo sale debajo.
  await menu("web");
  await elegir("Archivo nuevo");
  await page.locator(".arch-editar-campo").waitFor({ timeout: 3000 });
  pasos.enfocado = await page.evaluate(() => document.activeElement?.classList.contains("arch-editar-campo"));
  debe(pasos.enfocado, "el campo llega con el teclado");
  pasos.dondeSale = await page.evaluate(() => {
    const filas = [...document.querySelectorAll(".arch-arbol > *")];
    const i = filas.findIndex((x) => x.classList.contains("arch-editar"));
    return filas[i - 1]?.querySelector(".arch-nom")?.textContent ?? "";
  });
  debe(pasos.dondeSale === "web", `el campo va justo debajo de su carpeta («${pasos.dondeSale}»)`);
  await page.keyboard.type("App.tsx");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  pasos.error = (await page.locator(".arch-editar-error").textContent().catch(() => "")) ?? "";
  debe(/Ya hay algo/.test(pasos.error), `un nombre que ya existe no pisa nada: lo dice («${pasos.error}»)`);
  await page.locator(".arch-editar-campo").fill("nota.md");
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  pasos.trasCrear = await nombres();
  debe(pasos.trasCrear.includes("nota.md") && (await page.locator(".arch-editar").count()) === 0, `nace y sale en el árbol (${pasos.trasCrear})`);
  pasos.abierto = await page.evaluate(() => window.__llamadas.slice(window.__desde).filter(([c, a]) => c === "leer_archivo" && /nota\.md$/.test(a.ruta)).length);
  debe(pasos.abierto > 0, "y se abre en el editor para escribirlo");

  // 3. Esc lo deja sin crear nada.
  await menu(null);
  await elegir("Carpeta nueva");
  await page.locator(".arch-editar-campo").waitFor({ timeout: 3000 });
  await page.keyboard.type("no-quiero");
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  pasos.trasEsc = await page.evaluate(() => window.__llamadas.slice(window.__desde).filter(([c]) => c === "crear_carpeta").length);
  debe(pasos.trasEsc === 0 && (await page.locator(".arch-editar").count()) === 0, "Esc lo deja sin crear nada");

  // 4. Renombrar: el nombre llega seleccionado sin la extensión.
  await menu("viejo.md");
  await elegir("Renombrar");
  await page.locator(".arch-editar-campo").waitFor({ timeout: 3000 });
  pasos.seleccion = await page.evaluate(() => {
    const c = document.activeElement;
    return c && "value" in c ? c.value.slice(c.selectionStart, c.selectionEnd) : "";
  });
  debe(pasos.seleccion === "viejo", `llega seleccionado sin la extensión («${pasos.seleccion}»)`);
  await page.keyboard.type("nuevo");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  pasos.trasRenombrar = await nombres();
  debe(pasos.trasRenombrar.includes("nuevo.md") && !pasos.trasRenombrar.includes("viejo.md"), `renombrado (${pasos.trasRenombrar})`);

  // 5. La papelera.
  await menu("LICENSE");
  await elegir("papelera");
  await page.waitForTimeout(900);
  pasos.trasTirar = await nombres();
  pasos.papelera = await page.evaluate(() => window.__papelera ?? []);
  debe(!pasos.trasTirar.includes("LICENSE") && pasos.papelera.some((r) => /LICENSE$/.test(r)), `a la papelera (${pasos.trasTirar} · ${pasos.papelera})`);
  await page.screenshot({ path: ".playwright-mcp/archivos-crear.png" });
  return { pasos, fallos };
}
