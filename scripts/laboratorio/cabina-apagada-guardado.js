// Con la Cabina apagada, su tablero guardado se queda como estaba.
//
// Medido el 2026-10-31: `lib/tablero.ts` promete que con la Cabina apagada «nada
// lo pisa», pero el guardado seguía corriendo con cada cambio de los paneles,
// los minimizados o los grupos plegados, y escribía lo que hubiera (casi nada)
// encima del tablero bueno. Aquí lo dispara una terminal que sobrevivió a una
// caída: se recupera, y el tablero guardado se quedaba solo con ella. Abrir
// todas las de un grupo de la barra hacía lo mismo.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/cabina-apagada-guardado.js" })
async (page) => {
  const bueno = JSON.stringify({
    panes: [{ name: "El panel bueno", cwd: "C:\\proyectos\\Adeorq" }],
    cols: [{ w: 1, hs: [1], idx: [0] }],
  });
  // Detrás de una marca: el guion de arranque se queda en la página, y sin ella
  // apagaría la Cabina a los bancos que vengan después.
  await page.addInitScript((b) => {
    if (!sessionStorage.getItem("__lab_cabina_apagada")) return;
    localStorage.setItem("adeorq-partes", JSON.stringify(["cabina"]));
    localStorage.setItem("adeorq-layout", b);
    sessionStorage.setItem("__vivas", JSON.stringify([{ id: 7, cwd: "C:\\proyectos\\Vidorq", command: null }]));
  }, bueno);
  await page.evaluate(() => sessionStorage.setItem("__lab_cabina_apagada", "1"));
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(4500);
  const guardado = await page.evaluate(() => localStorage.getItem("adeorq-layout"));
  await page.evaluate(() => {
    sessionStorage.removeItem("__lab_cabina_apagada");
    sessionStorage.removeItem("__vivas");
  });
  return `${guardado === bueno ? "ok  " : "FALLA"} con la Cabina apagada, su tablero guardado no se toca — quedó: ${String(guardado).slice(0, 160)}`;
}
