// ¿Cabe la barra de arriba? En TODOS los anchos de la ventana y en el peor caso.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/barra-cabe.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// La barra va quitando piezas cuando no cabe (`RETIRADAS` en
// `lib/barraQueCabe.ts`, cada una en `data-sin`): los nombres de los botones de
// la Cabina, el título de la canción, el reproductor y el nombre «Adeorq». Las
// pestañas van solo con su icono en cualquier ancho (2026-10-10). Hasta
// el 2026-10-10 lo decidían cortes fijos, y este banco los daba por buenos
// midiendo una barra SIN el pulso de CPU, RAM y agentes: a Munir, con el suyo
// y la música sonando, la fila no le cabía a 1920 (el reproductor aplastado,
// «Cerrar todas» cortado). Ahora el peor caso lleva todo lo que puede llevar:
// la Cabina con tres terminales (salen «Minimizar todas», «Disposición» y
// «Cerrar todas»), el pulso con sus números más anchos, una decisión esperando
// y música con un título largo.
//
// Mide de 940 (el `minWidth` de la ventana en `tauri.conf.json`) a 1920 de 20
// en 20, y también que si la música empieza a sonar con la ventana quieta la
// barra se reajusta sola (eso lo ve el MutationObserver, no el de tamaño).
// Y vigila dos cosas más: que ninguna pestaña lleve su nombre escrito pero
// todas lo digan en el globo y en el `aria-label` (una fila de iconos mudos no
// la entiende nadie), y que al estrechar la ventana nunca vuelva una pieza que
// ya se fue.
//
// Devuelve { quitado, fallos }: `fallos` vacío es que la fila cabe siempre.
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
    // La música se enciende desde el banco con `window.__musica = true`.
    window.__musica = false;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd) => {
      switch (cmd) {
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        // El pulso del equipo con sus números más anchos: es lo que le faltaba
        // a este banco el día que dio por bueno un corte que no cabía.
        case "pulso":
          return { ramMb: 12700, ramPct: 40, sistemaMb: 24000, sistemaPct: 75, totalMb: 32000, procesos: 60, agentes: 16, cpuPct: 100, nucleos: 16 };
        case "media_now":
          return window.__musica
            ? { title: "Una canción con un título bastante largo de verdad", artist: "Alguien", playing: true, app: "Spotify", volume: 0.5 }
            : null;
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

  const medir = () => page.evaluate(() => {
    const barra = document.querySelector(".topbar");
    const derecha = Math.max(...[...barra.children].map((h) => h.getBoundingClientRect().right));
    // Lo aplastado se nota por dentro: el reproductor y las pestañas se
    // encogen antes que salirse de la barra.
    const cajas = [barra, ...barra.querySelectorAll(".tabs, .topbar-acciones, .np")];
    // El título de la canción no desborda nada al aplastarse (su caja lleva
    // `min-width: 0` y el texto `overflow: hidden`): llegó a medir 0 px a 1760
    // con todo «cabiendo». Si el texto no cabe entero, su caja tiene que estar
    // en su tope (`max-width` de `.np-title`), y el texto, dentro de ella: un
    // primer arreglo lo dejó saliéndose por encima del botón de al lado.
    const caja = barra.querySelector(".np-title");
    const t = barra.querySelector(".np-text");
    const visible = caja && t && getComputedStyle(t).display !== "none";
    const tituloAplastado = visible && t.scrollWidth > t.clientWidth + 1
      ? Math.max(0, Math.round(parseFloat(getComputedStyle(caja).maxWidth) - caja.getBoundingClientRect().width))
      : 0;
    const tituloMonta = visible
      ? Math.max(0, Math.round(t.getBoundingClientRect().right - caja.getBoundingClientRect().right))
      : 0;
    return {
      tituloAplastado,
      tituloMonta,
      sin: barra.dataset.sin ?? "?",
      sobra: Math.round(innerWidth - derecha),
      desborda: Math.max(0, ...cajas.map((c) => c.scrollWidth - c.clientWidth)),
      acciones: Boolean(document.querySelector(".topbar-acciones .tab-label")),
      pulso: /CPU/.test(barra.textContent),
      musica: Boolean(document.querySelector(".np")),
      cuenta: document.querySelector('[data-tab="decisiones"] .tab-count')?.textContent ?? null,
    };
  });
  // El navegador del MCP puede llevar zoom: una ventana de 1701 daba una página
  // de 1134. Se pide la ventana que da ESE ancho de página, y antes de medir
  // nada: la prueba de la música llegó a medirse a 1280 creyendo que era 1920.
  const k = 1920 / (await page.evaluate(() => innerWidth));
  const ancho = async (w) => {
    await page.setViewportSize({ width: Math.round(w * k), height: Math.round(1000 * k) });
    await page.waitForTimeout(250);
  };
  await ancho(1920);
  const pagina = await page.evaluate(() => innerWidth);
  if (Math.abs(pagina - 1920) > 2) fallos.push(`la página mide ${pagina} y no 1920: el banco no corrige el zoom`);

  // 1. La música empieza a sonar con la ventana quieta: tiene que reajustarse.
  const sinMusica = await medir();
  await page.evaluate(() => { window.__musica = true; });
  await page.waitForTimeout(4800);
  const conMusica = await medir();
  if (!conMusica.musica) fallos.push("no salió el reproductor: la prueba no prueba nada");
  if (conMusica.desborda > 1 || conMusica.sobra < 0) fallos.push(`con la música recién puesta a 1920 se desborda ${conMusica.desborda} px (sin «${conMusica.sin}»)`);
  const pestanas = await page.evaluate(() =>
    [...document.querySelectorAll(".tabs .tab")].map((b) => ({
      clave: b.dataset.tab,
      // Lo escrito dentro, quitando la cuenta (el número de Decisiones sí va).
      escrito: [...b.childNodes].filter((n) => !n.classList?.contains("tab-count")).map((n) => n.textContent).join("").trim(),
      nombre: b.getAttribute("aria-label") ?? "",
      globo: b.dataset.tip ?? "",
    })),
  );
  if (pestanas.length < 4) fallos.push(`solo hay ${pestanas.length} pestañas: la prueba no prueba nada`);
  for (const p of pestanas) {
    if (p.escrito) fallos.push(`la pestaña ${p.clave} lleva escrito «${p.escrito}»: van solo con el icono`);
    if (!p.nombre || !p.globo.startsWith(p.nombre)) fallos.push(`la pestaña ${p.clave} no dice su nombre (aria-label «${p.nombre}», globo «${p.globo}»)`);
  }

  // 2. Todos los anchos, de ancho a estrecho, con el peor caso puesto.
  const quitado = {};
  let antes = [];
  for (let w = 1920; w >= 940; w -= 20) {
    await ancho(w);
    const m = await medir();
    quitado[w] = m.sin;
    if (m.desborda > 1 || m.sobra < 0) fallos.push(`a ${w} px se desborda ${Math.max(m.desborda, -m.sobra)} px (sin «${m.sin}»)`);
    if (m.tituloAplastado > 1) fallos.push(`a ${w} px el título de la canción está aplastado ${m.tituloAplastado} px (sin «${m.sin}»)`);
    if (m.tituloMonta > 1) fallos.push(`a ${w} px el título se sale ${m.tituloMonta} px de su caja y monta encima de los botones (sin «${m.sin}»)`);
    const ahora = m.sin.split(" ").filter(Boolean);
    const vuelve = antes.filter((p) => !ahora.includes(p));
    if (vuelve.length) fallos.push(`a ${w} px vuelve ${vuelve.join(", ")}, que con más ancho ya se había quitado`);
    antes = ahora;
  }
  const peor = await medir();
  if (!peor.acciones) fallos.push("no salen los botones de la Cabina: no está el peor caso");
  if (!peor.pulso || !peor.musica || peor.cuenta !== "1") {
    fallos.push(`no está el peor caso (pulso ${peor.pulso}, música ${peor.musica}, cuenta ${peor.cuenta})`);
  }
  // Se resume en tramos: { "sin «acciones titulo»": "1660-1920", … }.
  const tramos = {};
  for (const [w, sin] of Object.entries(quitado).sort((a, b) => a[0] - b[0])) {
    const clave = `sin «${sin}»`;
    tramos[clave] = tramos[clave] ? tramos[clave].replace(/-\d+$|$/, `-${w}`) : w;
  }
  return { sinMusica1920: sinMusica.sin, conMusica1920: conMusica.sin, tramos, fallos };
}
