// La huella de los atajos de teclado de la app (Ctrl+Mayús+tecla).
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/atajos-globales.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// Pulsa cada atajo de `lib/atajosGlobales.ts` y apunta lo que se ve cambiar:
// cuántos paneles hay, con qué nombre nace el nuevo, si hay uno maximizado, si
// está el Asistente, la pantalla de pánico o el modo emisión. Sirve para mover
// ese código sin cambiarlo: la huella de antes y la de después tienen que ser
// la misma cadena. Y como todo banco de huella, no vale si sale estable sin
// ejercitar nada: por eso `fallos` exige que cada atajo cambie algo.
//
// Devuelve { suma, huella, fallos }: `suma` es la huella en un número.
async (page) => {
  const fallos = [];
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    localStorage.setItem("adeorq-layout", JSON.stringify({
      panes: [{ name: "Adeorq · consola", cwd: "C:\\proyectos\\Adeorq" }],
      cols: [{ w: 1, hs: [1], idx: [0] }],
    }));
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd) => {
      switch (cmd) {
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "pty_write": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
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

  const foto = () => page.evaluate(() => ({
    paneles: document.querySelectorAll(".pane-head").length,
    nombres: [...document.querySelectorAll(".pane-head")].map((h) => (h.querySelector(".pane-title, .ph-name, [class*='name']")?.textContent ?? "").trim()).join("|"),
    guardados: (JSON.parse(localStorage.getItem("adeorq-layout") ?? "{}").panes ?? []).map((p) => p.name).join("|"),
    columnas: (JSON.parse(localStorage.getItem("adeorq-layout") ?? "{}").cols ?? []).map((c) => c.idx.length).join("+"),
    // Maximizar no marca al panel: esconde a los demás. Se cuentan los que se ven.
    maximizado: [...document.querySelectorAll(".pane-head")].filter((h) => h.offsetParent !== null).length,
    capataz: document.querySelectorAll(".foreman, .foreman-overlay, [class*='foreman-']").length > 1,
    panico: document.querySelectorAll(".panic").length,
    emision: document.querySelector(".app")?.getAttribute("data-stream"),
    emisionGuardada: localStorage.getItem("adeorq-stream"),
  }));
  const pulsar = async (tecla) => {
    await page.keyboard.press(`Control+Shift+${tecla}`);
    await page.waitForTimeout(700);
    return foto();
  };

  // El teclado, en la terminal: es desde donde se pulsan de verdad.
  await page.locator(".xterm-helper-textarea").first().focus();
  const pasos = [["inicio", await foto()]];
  for (const tecla of ["T", "ArrowRight", "ArrowDown", "D", "F", "F", "A", "A", "P", "P", "E", "E"]) {
    pasos.push([tecla, await pulsar(tecla)]);
  }

  // Cada atajo tiene que haber cambiado ALGO respecto al paso anterior.
  for (let i = 1; i < pasos.length; i++) {
    if (JSON.stringify(pasos[i][1]) === JSON.stringify(pasos[i - 1][1])) {
      fallos.push(`Ctrl+Mayús+${pasos[i][0]} (paso ${i}) no cambió nada: la huella no lo ejercita`);
    }
  }
  const huella = pasos.map(([t, f]) => `${t}:${f.paneles}/${f.columnas}/${f.guardados}/ven${f.maximizado}/cap${f.capataz ? 1 : 0}/pan${f.panico}/em${f.emision}-${f.emisionGuardada}`).join("\n");
  // Un número para comparar dos huellas de un vistazo.
  const suma = [...huella].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { suma, huella, fallos };
}
