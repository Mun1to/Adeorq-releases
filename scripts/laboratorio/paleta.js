// La paleta de comandos (Ctrl+K), en la ventana de verdad.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/paleta.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// Lo que se prueba, que es lo que la lógica pura (`scripts/paleta-check.ts`) no
// puede ver:
//   · Ctrl+K la abre y Esc la cierra, devolviendo el teclado a quien lo tenía.
//   · Con el teclado DENTRO de una terminal, Ctrl+K abre la paleta y al shell
//     no le llega esa tecla.
//   · Una pestaña quitada de la cabecera (Memoria, apagada en el doble) se abre
//     desde aquí: es la promesa de `lib/cabecera.ts`.
//   · Una acción con atajo hace lo mismo que su atajo (abrir una terminal).
//   · Un proyecto abre una sesión de Claude en su carpeta.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    localStorage.setItem("adeorq-cabecera", JSON.stringify({ orden: [], ocultas: ["memoria"] }));
    localStorage.setItem("adeorq-layout", JSON.stringify({
      panes: [{ name: "Adeorq · consola", cwd: "C:\\proyectos\\Adeorq" }],
      cols: [{ w: 1, hs: [1], idx: [0] }],
    }));
    window.__lanzados = [];
    window.__escrito = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": window.__lanzados.push({ cwd: args.cwd, command: (args.command ?? []).join(" ") }); return null;
        case "pty_write": window.__escrito.push(args.data); return null;
        case "list_projects":
          return [
            { name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true },
            { name: "VoCript", path: "C:\\proyectos\\VoCript", hasGit: true },
          ];
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
        convertFileSrc: (ruta) => ruta,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      },
    });
  });

  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="cabina"]').click();
  await page.waitForTimeout(3000);

  const abierta = () => page.locator(".paleta").count().then((n) => n > 0);
  const filas = () => page.evaluate(() => [...document.querySelectorAll(".paleta-fila")].map((f) => f.textContent.replace(/\s+/g, " ").trim()));
  const vista = () => page.evaluate(() => document.querySelector('[data-tab][data-active="true"]')?.dataset.tab ?? "(ninguna en la cabecera)");
  const paneles = () => page.locator(".pane-head").count();
  const pasos = {};

  // 0. La pestaña apagada no está en la cabecera: si está, la prueba no prueba nada.
  if (await page.locator('[data-tab="memoria"]').count()) fallos.push("Memoria sigue en la cabecera: el doble no la apagó");

  // 1. Ctrl+K con el teclado dentro de la terminal.
  await page.locator(".xterm-helper-textarea").first().focus();
  const enTerminal = await page.evaluate(() => document.activeElement?.className ?? "");
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  pasos.abreDesdeLaTerminal = await abierta();
  if (!/xterm/.test(enTerminal)) fallos.push(`el teclado no estaba en la terminal (${enTerminal}): no se prueba lo de dentro`);
  if (!pasos.abreDesdeLaTerminal) fallos.push("Ctrl+K dentro de una terminal no abre la paleta");
  const alShell = await page.evaluate(() => window.__escrito.filter((d) => d.includes("\u000b")).length);
  if (alShell) fallos.push("al shell le llegó el Ctrl+K");
  pasos.entradas = (await filas()).length;
  if (!(await page.evaluate(() => document.activeElement?.classList.contains("paleta-input")))) fallos.push("la caja de la paleta no coge el teclado al abrirse");

  // 2. Esc la cierra y devuelve el teclado a la terminal.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  if (await abierta()) fallos.push("Esc no la cierra");
  const vuelve = await page.evaluate(() => document.activeElement?.className ?? "");
  if (!/xterm/.test(vuelve)) fallos.push(`al cerrar, el teclado no vuelve a la terminal (${vuelve || "nadie"})`);

  // 3. La pestaña apagada se abre desde aquí.
  if (await page.locator("[class*='mem-']").count()) fallos.push("ya hay algo de la Memoria en pantalla antes de pedirla: la prueba no distingue");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("memo");
  await page.waitForTimeout(200);
  pasos.alEscribirMemo = await filas();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  // La Memoria se reconoce por sus clases (`mem-…`); en la cabecera no está.
  pasos.trasMemoria = { abierta: await abierta(), hayMemoria: await page.locator("[class*='mem-']").count() };
  if (!/^Memoria/.test(pasos.alEscribirMemo[0] ?? "")) fallos.push(`escribiendo «memo» lo primero es «${pasos.alEscribirMemo[0]}»`);
  if (pasos.trasMemoria.abierta) fallos.push("elegir una entrada no cierra la paleta");
  if (!pasos.trasMemoria.hayMemoria) fallos.push("la pestaña apagada (Memoria) no se abrió desde la paleta");

  // 4. Una acción con atajo: abrir una terminal, con las flechas y Enter.
  await page.locator('[data-tab="cabina"]').click();
  await page.waitForTimeout(400);
  const antes = await paneles();
  await page.keyboard.press("Control+k");
  await page.keyboard.type("abrir una terminal");
  await page.waitForTimeout(200);
  pasos.alEscribirTerminal = await filas();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  pasos.paneles = [antes, await paneles()];
  if (pasos.paneles[1] !== antes + 1) fallos.push(`«Abrir una terminal» dejó ${pasos.paneles[1]} paneles donde había ${antes}`);

  // 5. Un proyecto: sesión nueva de Claude en su carpeta, con el ratón.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("vocr");
  await page.waitForTimeout(300);
  pasos.alEscribirVocr = await filas();
  await page.locator(".paleta-fila").first().click();
  await page.waitForTimeout(900);
  pasos.lanzados = await page.evaluate(() => window.__lanzados.slice(-1)[0] ?? null);
  if (!pasos.lanzados || !/VoCript/.test(pasos.lanzados.cwd) || !/claude/.test(pasos.lanzados.command)) {
    fallos.push(`elegir el proyecto no abrió Claude en su carpeta: ${JSON.stringify(pasos.lanzados)}`);
  }
  pasos.vistaFinal = await vista();
  return { pasos, fallos };
}
