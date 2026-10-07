// Lo apartado y los grupos de la Cabina, gesto a gesto, con una huella para
// comparar.
//
// Existe para mudar `minimizados` y `gruposOcultos` al almacén de la Cabina
// (decisión B1, `lib/cabina.ts`) sin cambiar lo que hacen: la huella tiene que
// salir igual antes y después. Recorre cinco pasos sobre un tablero sembrado
// (dos terminales del grupo «g1», apartado, y una consola suelta):
//
//   al abrir        el grupo apartado renace en la tira, con su marca de grupo;
//   traer el grupo  la ficha de una del grupo trae a las dos;
//   minimizar una   el botón de su cabecera la baja a la tira;
//   minimizar todas el botón de la barra de la Cabina las baja todas;
//   traer todas     el mismo botón las devuelve.
//
// En cada paso se apunta qué paneles se ven en el mosaico, qué fichas tiene la
// tira (y si van por grupo) y lo que queda guardado en `adeorq-layout`.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`):
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/apartar-grupos.js" })
async (page) => {
  const huella = (texto) => {
    let h = 5381;
    for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
    return h.toString(16);
  };
  const SEMBRADO = JSON.stringify({
    panes: [
      { name: "Adeorq · front", cwd: "C:\\proyectos\\Adeorq", grupo: "g1" },
      { name: "Adeorq · back", cwd: "C:\\proyectos\\Adeorq", grupo: "g1" },
      { name: "VoCript · consola", cwd: "C:\\proyectos\\VoCript" },
    ],
    cols: [{ w: 0.5, hs: [1, 1], idx: [0, 1] }, { w: 0.5, hs: [1], idx: [2] }],
    ocultos: ["g1"],
  });
  await page.addInitScript((texto) => {
    try {
      if (sessionStorage.getItem("__sembrar")) localStorage.setItem("adeorq-layout", texto);
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
  }, SEMBRADO);
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(5000);
  await page.evaluate(() => sessionStorage.removeItem("__sembrar"));
  await page.locator('[data-tab="cabina"]').first().click();
  await page.waitForTimeout(800);

  const foto = () =>
    page.evaluate(() => {
      const visibles = [...document.querySelectorAll("[data-pane-id]")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
        })
        .map((e) => e.querySelector(".pane-name")?.textContent ?? e.getAttribute("data-pane-id"));
      const tira = [...document.querySelectorAll(".minim-chip")].map(
        (b) => `${b.querySelector(".minim-nombre")?.textContent}${b.hasAttribute("data-grupo") ? " (grupo)" : ""}`,
      );
      let guardado = "";
      try {
        const t = JSON.parse(localStorage.getItem("adeorq-layout") ?? "{}");
        guardado = JSON.stringify({
          min: (t.panes ?? []).map((p) => `${p.name}${p.minimizado ? " min" : ""}`),
          ocultos: t.ocultos ?? [],
        });
      } catch { guardado = "ilegible"; }
      return { visibles: visibles.sort(), tira: tira.sort(), guardado };
    });

  const pasos = {};
  pasos.alAbrir = await foto();

  await page.locator(".minim-chip[data-grupo]").first().click();
  await page.waitForTimeout(700);
  pasos.traerGrupo = await foto();

  const consola = page.locator("[data-pane-id]", { hasText: "VoCript" }).first();
  await consola.hover();
  await consola.locator('button.pane-btn[data-tip^="Minimizar"]').first().click();
  await page.waitForTimeout(700);
  pasos.minimizarUna = await foto();

  await page.locator("button", { hasText: "Minimizar todas" }).first().click();
  await page.waitForTimeout(700);
  pasos.minimizarTodas = await foto();

  await page.locator("button", { hasText: "Traer todas" }).first().click();
  await page.waitForTimeout(700);
  pasos.traerTodas = await foto();

  const todo = JSON.stringify(pasos);
  return { huella: huella(todo), pasos };
}
