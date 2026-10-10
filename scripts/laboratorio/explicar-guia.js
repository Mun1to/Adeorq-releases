// «Que me la explique mi agente» (Ajustes › Ayuda).
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/explicar-guia.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// El botón tiene que abrir una sesión de Claude cuyo encargo lleve la ruta de
// la guía EN ESTE EQUIPO (la que da Rust, aquí el doble, con espacios y barras
// de Windows a propósito) y que le pida preguntar antes de explicar. Se mira la
// línea con la que nace el proceso, que es lo que de verdad recibe el agente.
//
// Devuelve { lanzado, fallos }.
async (page) => {
  const fallos = [];
  const RUTA = "C:\\Apps\\Random APPS\\Adeorq\\docs\\GUIA.md";
  await page.addInitScript((ruta) => {
    localStorage.clear();
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    window.__lanzados = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": window.__lanzados.push({ cwd: args.cwd, command: (args.command ?? []).join(" ") }); return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        case "read_guide": return "# Guía\n\n## Uno\n\nTexto.\n\n## Dos\n\nMás texto.";
        case "guide_path": return ruta;
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
  }, RUTA);

  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="ajustes"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="ajustes"]').click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Ayuda", exact: true }).first().click();
  await page.waitForTimeout(800);

  const boton = page.getByRole("button", { name: "Que me la explique mi agente" });
  if (!(await boton.count())) {
    fallos.push("el botón no está en Ajustes › Ayuda");
    return { lanzado: null, fallos };
  }
  await boton.click();
  await page.waitForTimeout(1500);

  const lanzado = await page.evaluate(() => window.__lanzados.slice(-1)[0] ?? null);
  const vista = await page.evaluate(() => document.querySelector('[data-tab][data-active="true"]')?.dataset.tab ?? "");
  const nombre = await page.evaluate(() => JSON.parse(localStorage.getItem("adeorq-layout") ?? "{}").panes?.slice(-1)[0]?.name ?? null);
  if (!lanzado) fallos.push("no se lanzó ningún proceso");
  else {
    if (!/\bclaude\b/.test(lanzado.command)) fallos.push(`lo lanzado no es Claude: ${lanzado.command.slice(0, 120)}`);
    if (!lanzado.command.includes(RUTA)) fallos.push("el encargo no lleva la ruta de la guía tal cual (espacios y barras incluidos)");
    if (!/pregúntame/.test(lanzado.command)) fallos.push("el encargo no le pide preguntar antes de explicar");
  }
  if (vista !== "cabina") fallos.push(`tras pulsarlo te deja en «${vista}» y no en la Cabina, que es donde está la sesión`);
  return { lanzado, nombre, vista, fallos };
}
