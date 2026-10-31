// Un fallo al leer el estado de la barra no la da por vacía ni pisa el archivo bueno.
//
// Medido el 2026-10-31: sin archivo, Rust ya contesta «{}», así que lo que llega
// como error es otra cosa (el archivo bloqueado por otro programa, un permiso).
// La barra lo trataba como el primer arranque: se daba por cargada con el estado
// vacío y el primer cambio (fijar, arrastrar, el modo de la barra) guardaba ese
// vacío encima, y se perdían grupos, alias, logos, fijadas y archivadas.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/barra-lectura-fallida.js" })
async (page) => {
  const bueno = JSON.stringify({ groups: [{ id: "g1", name: "Mi grupo", project: "C:\\proyectos\\Adeorq" }], projectAlias: { "C:\\proyectos\\Adeorq": "Mi alias" } });
  await page.addInitScript((b) => {
    if (!sessionStorage.getItem("__lab_ui_falla")) return;
    window.__uiGuardados = [];
    let fallos = 2; // las dos primeras lecturas fallan, luego el archivo se deja leer
    const i = window.__TAURI_INTERNALS__;
    const orig = i.invoke;
    i.invoke = (cmd, args, o) => {
      if (cmd === "load_ui_state") return fallos-- > 0 ? Promise.reject("El proceso no tiene acceso al archivo (os error 32)") : Promise.resolve(b);
      if (cmd === "save_ui_state") return (window.__uiGuardados.push(args.content), Promise.resolve(null));
      return orig(cmd, args, o);
    };
  }, bueno);
  await page.evaluate(() => sessionStorage.setItem("__lab_ui_falla", "1"));
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(1500);
  // Un cambio mientras la lectura falla: el modo de la barra.
  await page.evaluate(() => document.querySelector('.rail-tab[data-tip="Solo los logos, en grande"]').click());
  await page.waitForTimeout(8000);
  const guardados = await page.evaluate(() => window.__uiGuardados);
  await page.evaluate(() => sessionStorage.removeItem("__lab_ui_falla"));
  const pisa = guardados.filter((g) => !g.includes("Mi grupo"));
  const conElCambio = guardados.some((g) => g.includes("Mi grupo") && /"railMode":\s*"logo"/.test(g));
  return [
    `${pisa.length === 0 ? "ok  " : "FALLA"} ningún guardado pisa el archivo bueno con la barra vacía (${pisa.length} de ${guardados.length})`,
    `${conElCambio ? "ok  " : "FALLA"} cuando el archivo se deja leer, el cambio se guarda encima de lo bueno`,
  ].join("\n");
}
