// El árbol del panel de Archivos: letras de git, lo borrado, iconos por tipo y
// el menú de clic derecho.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página.
//
// Siembra un proyecto con un archivo modificado, uno nuevo, uno borrado (que ya
// no está en el disco) y varios quietos de distinta clase, y mira lo que las
// reglas (`arbol-check`, `estado-archivos-check`, `tipo-archivo-check`) no ven:
//   · Cada archivo cambiado lleva su letra de git al final de la fila.
//   · El borrado vuelve a su carpeta, tachado, con su D, y no se puede abrir.
//   · Cada archivo lleva el icono de su familia; las carpetas, su flecha.
//   · El clic derecho ofrece abrir, copiar la ruta y copiar la relativa (con
//     barras normales), y enseñarlo en el explorador; en la raíz no hay relativa.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:1420" }).catch(() => {});
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
    const viejo = Date.now() - 3_600_000;
    window.__carpetas = {
      [R]: [
        { nombre: "web", carpeta: true },
        { nombre: ".gitignore", cuando: viejo },
        { nombre: "LICENSE", cuando: viejo },
        { nombre: "logo.png", cuando: viejo },
        { nombre: "package.json", cuando: viejo },
        { nombre: "probar.sh", cuando: viejo },
      ],
      [`${R}\\web`]: [
        { nombre: "App.css", cuando: viejo },
        { nombre: "App.tsx", cuando: viejo },
        { nombre: "nuevo.rs", cuando: viejo },
      ],
    };
    window.__git = {
      git: true,
      cambios: [
        { ruta: `${R}\\web\\App.tsx`, estado: "M", cuando: viejo },
        { ruta: `${R}\\web\\nuevo.rs`, estado: "A", cuando: viejo },
        { ruta: `${R}\\web\\caducado.md`, estado: "D", cuando: 0 },
      ],
    };
  }, raiz);
  // Otra cara y vuelta, para que el árbol lea ya con la siembra puesta.
  await page.locator('.franja-btn[data-tip="Ocultar panel"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.franja-btn[data-tip="Archivos"]').first().click();
  await page.waitForTimeout(1500);
  await page.locator(".arch-fila", { hasText: "web" }).first().click();
  await page.waitForTimeout(3200);

  const filas = () => page.evaluate(() => [...document.querySelectorAll(".arch-fila")].map((b) => ({
    nombre: b.querySelector(".arch-nom")?.textContent,
    letra: b.querySelector(".arch-letra")?.textContent ?? "",
    borrado: b.hasAttribute("data-borrado"),
    tipo: b.querySelector(".arch-ico")?.getAttribute("data-tipo") ?? "carpeta",
    dibujo: b.querySelectorAll(".arch-ico svg path").length,
    tachado: getComputedStyle(b.querySelector(".arch-nom")).textDecorationLine,
  })));

  // 1 a 3. Letras, el borrado y los iconos.
  const f = await filas();
  pasos.filas = f.map((x) => `${x.nombre}:${x.tipo}${x.letra ? `:${x.letra}` : ""}${x.borrado ? ":borrado" : ""}`);
  const de = (n) => f.find((x) => x.nombre === n) || {};
  debe(de("App.tsx").letra === "M" && de("nuevo.rs").letra === "A" && de("App.css").letra === "", `las letras de git (${pasos.filas})`);
  debe(de("caducado.md").letra === "D" && de("caducado.md").borrado && de("caducado.md").tachado === "line-through", `el borrado vuelve tachado y con su D (${JSON.stringify(de("caducado.md"))})`);
  debe(pasos.filas.join() === "web:carpeta,App.css:estilo,App.tsx:web:M,caducado.md:texto:D:borrado,nuevo.rs:codigo:A,.gitignore:datos,LICENSE:texto,logo.png:imagen,package.json:datos,probar.sh:consola", `cada uno en su sitio y con su familia (${pasos.filas})`);
  debe(f.every((x) => x.dibujo >= 1), "todas las filas llevan su dibujo");

  // 2b. El borrado no se abre.
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await page.locator(".arch-fila", { hasText: "caducado.md" }).first().click();
  await page.waitForTimeout(500);
  pasos.abreBorrado = await page.evaluate(() => window.__llamadas.slice(window.__desde).filter(([c]) => c === "leer_archivo").length);
  debe(pasos.abreBorrado === 0, "pulsar uno borrado no intenta abrirlo");

  // 4. El menú de una fila. Lo copiado se apunta al escribirlo: en el navegador
  //    del banco, leer el portapapeles de vuelta da siempre vacío.
  await page.evaluate(() => {
    window.__copiado = [];
    const real = navigator.clipboard.writeText.bind(navigator.clipboard);
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: (texto) => { window.__copiado.push(texto); return real(texto).catch(() => {}); },
    });
  });
  await page.locator(".arch-fila", { hasText: "App.tsx" }).first().click({ button: "right" });
  await page.locator(".ctx-menu").waitFor({ timeout: 3000 });
  pasos.menu = await page.locator(".ctx-menu .ctx-item, .ctx-menu .ctx-head, .ctx-menu [class*='head']").evaluateAll((xs) => xs.map((x) => x.innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
  const menuTxt = (await page.locator(".ctx-menu").innerText()).replace(/\s+/g, " ");
  debe(/App\.tsx/.test(menuTxt) && /Abrir/.test(menuTxt) && /Copiar ruta relativa/.test(menuTxt) && /web\/App\.tsx/.test(menuTxt) && /Enseñar en el explorador/.test(menuTxt), `el menú de un archivo (${menuTxt})`);
  await page.getByText("Copiar ruta relativa", { exact: false }).first().click();
  await page.waitForTimeout(300);
  pasos.relativa = await page.evaluate(() => window.__copiado.at(-1) ?? "");
  debe(pasos.relativa === "web/App.tsx", `copia la relativa con barras normales («${pasos.relativa}»)`);
  await page.locator(".arch-fila", { hasText: "App.tsx" }).first().click({ button: "right" });
  await page.locator(".ctx-menu").waitFor({ timeout: 3000 });
  await page.locator(".ctx-menu").getByText("Copiar ruta", { exact: true }).first().click();
  await page.waitForTimeout(300);
  pasos.absoluta = await page.evaluate(() => window.__copiado.at(-1) ?? "");
  debe(pasos.absoluta === `${raiz}\\web\\App.tsx`, `copia la ruta entera («${pasos.absoluta}»)`);

  // 5. El de la raíz: sin relativa, que sería vacía.
  await page.locator(".arch-raiz").first().click({ button: "right" });
  await page.locator(".ctx-menu").waitFor({ timeout: 3000 });
  const raizTxt = (await page.locator(".ctx-menu").innerText()).replace(/\s+/g, " ");
  debe(/Copiar ruta/.test(raizTxt) && !/relativa/.test(raizTxt) && !/Abrir/.test(raizTxt), `el menú de la raíz (${raizTxt})`);
  await page.keyboard.press("Escape");

  // 6. El del borrado: se copia su ruta, pero ni se abre ni se enseña (no está).
  await page.locator(".arch-fila", { hasText: "caducado.md" }).first().click({ button: "right" });
  await page.locator(".ctx-menu").waitFor({ timeout: 3000 });
  const borradoTxt = (await page.locator(".ctx-menu").innerText()).replace(/\s+/g, " ");
  debe(/Copiar ruta/.test(borradoTxt) && !/Abrir/.test(borradoTxt) && !/explorador/.test(borradoTxt), `el menú de uno borrado (${borradoTxt})`);
  await page.keyboard.press("Escape");

  return { pasos, fallos };
}
