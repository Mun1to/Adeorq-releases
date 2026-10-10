// ¿Se pone nombre solo el panel, y solo el que no decía nada?
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/nombre-solo.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// Tres paneles de Claude con su sesión sabida, y el doble contesta que las tres
// sesiones ya tienen título («Arreglar la barra de arriba»):
//   · «Adeorq · claude», de fábrica: tiene que pasar a llamarse como la sesión,
//     con el proyecto delante.
//   · «Adeorq · lo mío», puesto a mano: se queda.
//   · «VoCript · claude», de fábrica pero con una sesión SIN título: se queda.
// Y en ningún caso se escribe en el transcript (`rename_session`): eso es de
// renombrar a mano. La lógica pura tiene su banco en `scripts/nombre-solo-check.ts`.
//
// Devuelve { nombres, escritos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  await page.addInitScript(() => {
    const SID = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`;
    localStorage.clear();
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    const claude = (n) => ["powershell.exe", "-NoLogo", "-NoExit", "-Command", `claude --resume ${SID(n)}`];
    localStorage.setItem("adeorq-layout", JSON.stringify({
      panes: [
        { name: "Adeorq · claude", cwd: "C:\\proyectos\\Adeorq", command: claude(1) },
        { name: "Adeorq · lo mío", cwd: "C:\\proyectos\\Adeorq", command: claude(2) },
        { name: "VoCript · claude", cwd: "C:\\proyectos\\VoCript", command: claude(3) },
      ],
      cols: [{ w: 0.34, hs: [1], idx: [0] }, { w: 0.33, hs: [1], idx: [1] }, { w: 0.33, hs: [1], idx: [2] }],
    }));
    window.__invocados = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd, args) => {
      window.__invocados.push(cmd);
      switch (cmd) {
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "transcript_exists": return true;
        case "list_projects":
          return [
            { name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true },
            { name: "VoCript", path: "C:\\proyectos\\VoCript", hasGit: true },
          ];
        case "session_context":
          return {
            model: "Opus 5", used: 40000, window: 1000000, percent: 4, agentsLive: 0, agentsTotal: 0,
            sessionId: args.sessionId, folder: "C--proyectos-Adeorq", state: "lista",
            // La tercera sesión todavía no tiene título.
            title: args.sessionId === SID(3) ? "" : "Arreglar la barra de arriba",
          };
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
  // Los paneles renacen de uno en uno y cada uno pregunta por su sesión al nacer.
  await page.waitForTimeout(6000);

  const leer = () => page.evaluate(() => ({
    cabeceras: [...document.querySelectorAll(".pane-head")].map((h) => h.textContent.replace(/\s+/g, " ").trim().slice(0, 90)),
    guardados: JSON.parse(localStorage.getItem("adeorq-layout") ?? "{}").panes?.map((p) => p.name) ?? [],
    escritos: window.__invocados.filter((c) => c === "rename_session").length,
    preguntas: window.__invocados.filter((c) => c === "session_context").length,
  }));
  const r = await leer();

  if (r.guardados.length !== 3) fallos.push(`no están los tres paneles (${r.guardados.length}): la prueba no prueba nada`);
  if (r.preguntas < 3) fallos.push(`solo se preguntó ${r.preguntas} veces por la sesión: los paneles no son de Claude para la app`);
  if (r.guardados[0] !== "Adeorq · Arreglar la barra de arriba") fallos.push(`el de fábrica se llama «${r.guardados[0]}» y no como su sesión`);
  if (r.guardados[1] !== "Adeorq · lo mío") fallos.push(`el puesto a mano cambió a «${r.guardados[1]}»`);
  if (r.guardados[2] !== "VoCript · claude") fallos.push(`el de la sesión sin título cambió a «${r.guardados[2]}»`);
  if (!r.cabeceras.some((c) => c.includes("Arreglar la barra de arriba"))) fallos.push("ninguna cabecera enseña el título de la sesión");
  if (r.escritos) fallos.push(`se escribió ${r.escritos} veces en un transcript: el nombre solo no escribe`);
  return { nombres: r.guardados, cabeceras: r.cabeceras, escritos: r.escritos, fallos };
}
