// ¿Cabe la barra de arriba con los nombres de las pestañas puestos?
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/barra-cabe.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// Los nombres se esconden por debajo de un ancho fijo (`@media (max-width: …)`
// en `15-agenda-sesiones.css`), y ese número se midió el 2026-08-02 con ocho
// pestañas. Cada pestaña nueva con nombre le quita unos cien píxeles a la
// fila, así que el número tiene que subir con ella: esto mide el peor caso (la
// Cabina con tres terminales, que es cuando salen «Minimizar todas»,
// «Disposición» y «Cerrar todas», música sonando con un título largo y una
// decisión esperando) a un píxel por encima del corte, en el 1920 de su
// pantalla principal y en todos los anchos de 940 a 1920, de 20 en 20.
//
// Devuelve { corte, medidas, fallos }: `fallos` vacío es que la fila cabe.
async (page) => {
  const fallos = [];
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude", "codex"] }));
    localStorage.setItem("adeorq-layout", JSON.stringify({
      panes: [
        { name: "Adeorq · front", cwd: "C:\\proyectos\\Adeorq" },
        { name: "Adeorq · back", cwd: "C:\\proyectos\\Adeorq" },
        { name: "VoCript · consola", cwd: "C:\\proyectos\\VoCript" },
      ],
      cols: [{ w: 0.5, hs: [1, 1], idx: [0, 1] }, { w: 0.5, hs: [1], idx: [2] }],
    }));
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd) => {
      switch (cmd) {
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        case "media_now":
          return { title: "Una canción con un título bastante largo de verdad", artist: "Alguien", playing: true, app: "Spotify", volume: 0.5 };
        case "decisiones_listar":
          return [{ id: "d1", titulo: "Una", creada: Date.now(), preguntas: [{ id: "A", titulo: "¿?", opciones: [{ texto: "Sí", recomendada: false }, { texto: "No", recomendada: false }] }] }];
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
  await page.waitForTimeout(3000);
  await page.locator('[data-tab="cabina"]').click();
  await page.waitForTimeout(1500);

  // El corte, leído de la hoja de verdad y no copiado aquí.
  const corte = await page.evaluate(() => {
    for (const hoja of document.styleSheets) {
      let reglas;
      try { reglas = hoja.cssRules; } catch { continue; }
      for (const r of reglas) {
        if (r instanceof CSSMediaRule && [...r.cssRules].some((x) => x.selectorText?.includes(".tabs .tab-label"))) {
          const m = /max-width:\s*(\d+)px/.exec(r.conditionText);
          if (m) return Number(m[1]);
        }
      }
    }
    return null;
  });
  if (!corte) return { corte, fallos: ["no encuentro el corte de .tabs .tab-label"] };

  const medir = () => page.evaluate(() => {
    const barra = document.querySelector(".topbar");
    const derecha = Math.max(...[...barra.children].map((h) => h.getBoundingClientRect().right));
    const nombres = [...document.querySelectorAll(".tabs .tab-label")].some((x) => getComputedStyle(x).display !== "none");
    // Lo que no cabe se nota por dentro: la fila de pestañas se aprieta y
    // recorta sin que la barra entera se salga de la ventana.
    const cajas = [barra, document.querySelector(".tabs"), document.querySelector(".topbar-acciones")].filter(Boolean);
    return {
      ancho: innerWidth,
      nombres,
      sobra: Math.round(innerWidth - derecha),
      desborda: Math.max(...cajas.map((c) => c.scrollWidth - c.clientWidth)),
      acciones: Boolean(document.querySelector(".topbar-acciones .tab-label")),
      musica: Boolean(document.querySelector(".np-text")),
      cuenta: document.querySelector('[data-tab="decisiones"] .tab-count')?.textContent ?? null,
    };
  });

  // El navegador del MCP puede llevar zoom: una ventana de 1701 daba una página
  // de 1134. Se pide la ventana que da ESE ancho de página.
  const k = 1920 / (await page.evaluate(() => innerWidth));
  const medidas = [];
  for (const ancho of [corte + 1, 1920]) {
    await page.setViewportSize({ width: Math.round(ancho * k), height: Math.round(1000 * k) });
    await page.waitForTimeout(500);
    const m = await medir();
    medidas.push(m);
    if (!m.nombres) fallos.push(`a ${ancho} px los nombres tendrían que verse`);
    if (m.sobra < 0 || m.desborda > 1) fallos.push(`a ${ancho} px la fila no cabe: se desborda ${Math.max(m.desborda, -m.sobra)} px`);
  }
  // Y de 940 a 1920 de 20 en 20: la fila tiene más escalones que el de los
  // nombres (el reproductor se encoge por debajo de 1150), y entre dos de ellos
  // puede quedar un ancho en que algo pise a otra cosa. Desde 940 porque es el
  // `minWidth` de la ventana en `tauri.conf.json`: más estrecha no se pone (a
  // 880 ya se desborda 29 px, y da igual porque nunca se ve).
  const barrido = [];
  for (let ancho = 940; ancho <= 1920; ancho += 20) {
    await page.setViewportSize({ width: Math.round(ancho * k), height: Math.round(1000 * k) });
    await page.waitForTimeout(200);
    const m = await medir();
    if (m.sobra < 0 || m.desborda > 1) barrido.push(`${ancho}: se desborda ${Math.max(m.desborda, -m.sobra)} px`);
  }
  if (barrido.length) fallos.push(`la fila no cabe en ${barrido.length} anchos: ${barrido.join(" · ")}`);

  // Que el peor caso de verdad esté puesto, o la medida no dice nada.
  const peor = medidas[0];
  if (!peor.acciones || !peor.musica || peor.cuenta !== "1") {
    fallos.push(`no está el peor caso (acciones ${peor.acciones}, música ${peor.musica}, cuenta ${peor.cuenta})`);
  }
  return { corte, medidas, fallos };
}
