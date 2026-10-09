// El menú «Mandar a…» de una imagen del lienzo, ¿queda por encima de la tarjeta
// de al lado?
//
//   1. `pnpm dev`
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/doble-conserje.js")
//   3. browser_run_code_unsafe(filename = "scripts/laboratorio/menu-imagen.js")
//
// Es el cuarto menú con el mismo fallo de capas (`.ctx-menu`, `.tip`,
// `.sess-menu` y este): pintado DENTRO de su tarjeta, su z-index solo compite
// con sus hermanos, y la tarjeta de al lado, que es otro nodo de React Flow,
// queda por encima. Una imagen pequeña con una nota justo encima lo enseña: el
// menú se abre hacia arriba y se mete en la nota.
//
// Devuelve { fallos, quien }: `quien` es lo que el navegador pinta en el centro
// de la parte del menú que se sale de la imagen.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  // Un SVG gris de 400x300: basta con que sea una imagen de verdad.
  const PNG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzVhNmI4NSIvPjwvc3ZnPg==";
  const tablero = {
    kind: "adeorq-lienzo", v: 1, guardado: new Date().toISOString(), proyecto: "Adeorq",
    nodos: [
      // Seis terminales: con una sola el menú es tan corto que no sale de la
      // imagen, y entonces no hay nada que tapar.
      ...[0, 1, 2, 3, 4, 5].map((i) => ({
        id: `t${i}`, x: 520 + (i % 3) * 500, y: Math.floor(i / 3) * 340, w: 480, h: 320, tipo: "term", kind: "claude",
        proyecto: "Adeorq", ruta: "C:\\proyectos\\Adeorq", cmd: ["cmd.exe", "/k", "claude"],
      })),
      { id: "n1", x: 0, y: 0, w: 300, h: 290, tipo: "nota", nota: "nota-banco", color: "#ffd166" },
      { id: "i1", x: 0, y: 300, w: 300, h: 140, tipo: "img", src: PNG, iw: 400, ih: 300, formas: [] },
    ],
    flechas: [], trazos: [],
  };
  await page.evaluate((t) => sessionStorage.setItem("__tablero", JSON.stringify(t)), tablero);
  await page.reload();
  await page.locator('[data-tab="lienzo"]').first().click();
  await page.locator(".react-flow__node-img").waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);

  const boton = page.locator(".react-flow__node-img").getByRole("button", { name: /Mandar a/ });
  debe(await boton.isEnabled(), "«Mandar a…» encendido, con una terminal en el lienzo");
  await boton.click();
  await page.locator(".img-menu").waitFor();
  const r = await page.evaluate(() => {
    const menu = document.querySelector(".img-menu").getBoundingClientRect();
    const img = document.querySelector(".react-flow__node-img").getBoundingClientRect();
    // El trozo del menú que queda por encima del borde de la imagen.
    const arriba = Math.max(menu.top, 0);
    const abajo = Math.min(menu.bottom, img.top);
    if (abajo - arriba < 4) return { sale: false };
    const el = document.elementFromPoint(menu.left + menu.width / 2, (arriba + abajo) / 2);
    return {
      sale: true,
      quien: el?.closest(".img-menu") ? "el menú" : el?.closest(".react-flow__node")?.className.match(/react-flow__node-\w+/)?.[0] ?? el?.className ?? "nada",
    };
  });
  debe(r.sale, "el menú se sale de la imagen hacia arriba (si no, la prueba no prueba nada)");
  debe(r.quien === "el menú", `el menú se ve por encima de la tarjeta de al lado (sale ${r.quien})`);
  debe(await page.locator(".img-menu li").count() === 6, "salen las seis terminales");
  await page.screenshot({ path: "C:/Users/Muni/AppData/Local/Temp/claude/C--proyectos-Adeorq/572c3eb8-4cba-4c56-8923-bddd346e5626/scratchpad/menu-imagen.png" });

  // Colgado del body ya no se mueve con la tarjeta: tiene que cerrarse solo.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  debe(await page.locator(".img-menu").count() === 0, "Esc lo cierra");
  // Un punto vacío del lienzo, medido y no escrito a mano: el navegador del MCP
  // puede llevar zoom y la página no mide lo que dice la ventana.
  const vacio = await page.evaluate(() => {
    const r = document.querySelector(".react-flow__pane").getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.bottom - 40 };
  });
  await boton.click();
  await page.locator(".img-menu").waitFor();
  await page.mouse.move(vacio.x, vacio.y);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(150);
  debe(await page.locator(".img-menu").count() === 0, "hacer zoom en el lienzo lo cierra");
  await boton.click();
  await page.locator(".img-menu").waitFor();
  await page.mouse.click(vacio.x, vacio.y);
  await page.waitForTimeout(150);
  debe(await page.locator(".img-menu").count() === 0, "pulsar fuera lo cierra");
  return { fallos, quien: r.quien };
}
