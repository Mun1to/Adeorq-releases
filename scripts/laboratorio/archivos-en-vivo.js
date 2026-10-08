// El panel de Archivos, al día solo y con colores de estado.
//
// Munir, 2026-10-08: «que se vaya actualizando en tiempo real, y colores de
// estado». Siembra un proyecto (un archivo cambiado, uno nuevo que se está
// escribiendo, uno escrito hace un segundo fuera de git y uno quieto), abre la
// cara de Archivos y comprueba:
//
//   colores      cada fila con su estado, y la carpeta con el de lo de dentro;
//   en vivo      un archivo que aparece en el disco sale solo, sin tocar nada;
//   se apaga     cuando lo nuevo deja de escribirse, pasa de amarillo a «nuevo».
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`):
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/archivos-en-vivo.js" })
async (page) => {
  // Una consola en un proyecto: el árbol enseña la carpeta de la terminal que tienes delante.
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
    const ahora = Date.now();
    window.__carpetas = {
      [R]: [
        { nombre: "web", carpeta: true },
        { nombre: "notas.txt", cuando: ahora - 1000 },
        { nombre: "quieto.txt", cuando: ahora - 3_600_000 },
      ],
      [`${R}\\web`]: [{ nombre: "App.tsx", cuando: ahora - 60_000 }, { nombre: "nuevo.ts", cuando: ahora - 2000 }],
    };
    window.__git = {
      git: true,
      cambios: [
        { ruta: `${R}\\web\\App.tsx`, estado: "M", cuando: ahora - 60_000 },
        { ruta: `${R}\\web\\nuevo.ts`, estado: "A", cuando: ahora - 2000 },
      ],
    };
  }, raiz);
  // Otra cara y vuelta, para que el árbol lea ya con la siembra puesta.
  await page.locator('.franja-btn[data-tip="Ocultar panel"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.franja-btn[data-tip="Archivos"]').first().click();
  await page.waitForTimeout(1500);

  const foto = () =>
    page.evaluate(() => ({
      filas: [...document.querySelectorAll(".arch-fila")].map((b) => `${b.querySelector(".arch-nom")?.textContent} ${b.getAttribute("data-estado") ?? "-"}`),
      cuentas: [...document.querySelectorAll(".arch-cuenta")].map((c) => c.textContent),
    }));
  const r = { raiz };
  r.colores = await foto();

  await page.locator(".arch-fila", { hasText: "web" }).first().click();
  await page.waitForTimeout(1200);
  r.desplegada = await foto();

  // Aparece un archivo en el disco, sin tocar el panel.
  await page.evaluate((R) => {
    window.__carpetas[`${R}\\web`].push({ nombre: "otro.md", cuando: Date.now() });
    window.__git.cambios.push({ ruta: `${R}\\web\\otro.md`, estado: "A", cuando: Date.now() });
  }, raiz);
  await page.waitForTimeout(3200);
  r.enVivo = await foto();
  await page.screenshot({ path: ".playwright-mcp/archivos-amarillo.png" });

  // Lo abres en el editor y escribes algo: la fila pasa a «sin guardar».
  await page.locator(".arch-fila", { hasText: "App.tsx" }).first().click();
  await page.waitForTimeout(1500);
  await page.locator(".cm-content").first().click();
  await page.keyboard.type("// ");
  await page.waitForTimeout(3200);
  r.sinGuardar = await foto();

  // Lo nuevo deja de escribirse: su hora se queda atrás.
  await page.evaluate((R) => {
    const viejo = Date.now() - 60_000;
    for (const f of window.__carpetas[`${R}\\web`]) f.cuando = viejo;
    for (const c of window.__git.cambios) c.cuando = viejo;
    window.__carpetas[R][1].cuando = viejo;
  }, raiz);
  await page.waitForTimeout(3200);
  r.seApaga = await foto();
  await page.screenshot({ path: ".playwright-mcp/archivos-en-vivo.png" });
  return r;
}
