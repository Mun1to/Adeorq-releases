// ¿Cabe la barra de arriba? En TODOS los anchos de la ventana y en el peor caso.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/barra-cabe.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// La barra va quitando piezas cuando no cabe (`RETIRADAS` en
// `lib/barraQueCabe.ts`, cada una en `data-sin`): el título de la canción, el
// reproductor y el relleno de las pestañas. El nombre «Adeorq» de al lado de
// Adeo ya no va en ningún ancho (2026-10-12). Las pestañas van solo con su icono en
// cualquier ancho (2026-10-10), y los tres botones de la Cabina también
// (2026-10-11). Hasta
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
// Y vigila tres cosas más: que las pestañas lleven su nombre escrito, entero,
// en cada ancho en que la barra no ha soltado «pestanas», y ninguno cuando sí
// (volvieron el 2026-10-12; medias tintas, un nombre cortado o unas con nombre
// y otras sin él, no valen); que todas lo digan siempre en el globo y en el
// `aria-label` (una fila de iconos mudos no la entiende nadie); y que al
// estrechar la ventana nunca vuelva una pieza que ya se fue.
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
          // «viva»: desde la 0.9.189 el número de la pestaña cuenta solo las que
          // tienen detrás una terminal esperando, y sin esto no salía ninguno.
          return [{ id: "d1", titulo: "Una", creada: Date.now(), vigencia: "viva", preguntas: [{ id: "A", titulo: "¿?", opciones: [{ texto: "Sí", recomendada: false }, { texto: "No", recomendada: false }] }] }];
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
      // Los tres botones de la Cabina, que se reconocen por su nombre: están,
      // sin nada escrito y con su globo.
      acciones: [...document.querySelectorAll(".topbar-acciones > .tab")]
        .filter((b) => ["Minimizar todas", "Traer todas", "Disposición", "Cerrar todas"].includes(b.getAttribute("aria-label") ?? ""))
        .map((b) => ({
          escrito: b.querySelector(".tab-label")?.textContent ?? "",
          nombre: b.getAttribute("aria-label"),
          globo: b.dataset.tip ?? "",
        })),
      // Los nombres de las pestañas: cuántos se ven, y cuántos no caben enteros.
      pestanas: document.querySelectorAll(".tabs .tab").length,
      nombres: [...document.querySelectorAll(".tabs .tab-label")].filter((n) => n.getBoundingClientRect().width > 0).length,
      nombresCortados: [...document.querySelectorAll(".tabs .tab-label")].filter((n) => n.getBoundingClientRect().width > 0 && n.scrollWidth > n.clientWidth + 1).length,
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

  // 0. El detalle del Pulso se VE al abrirlo, y abrirlo no le quita nada a la
  //    barra. Hasta el 2026-10-12 se montaba dentro de ella: la barra lo
  //    recortaba entero (no se veía nunca) y encima lo contaba como contenido
  //    suyo, así que al pulsarlo creía que no cabía y soltaba piezas.
  const DIR = "C:/proyectos/Adeorq/.playwright-mcp/";
  const fotos = [];
  const abrirPulso = async (w) => {
    await ancho(w);
    const antesDeAbrir = (await medir()).sin;
    await page.evaluate(() => document.querySelector(".pulso")?.click());
    await page.waitForTimeout(350);
    const d = await page.evaluate(() => {
      const caja = document.querySelector(".pulso-detalle");
      if (!caja) return null;
      const r = caja.getBoundingClientRect();
      const puntos = [[r.left + 14, r.top + 14], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 14, r.bottom - 14]];
      return {
        visto: puntos.every(([x, y]) => caja.contains(document.elementFromPoint(x, y))),
        dentro: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width > 200 && r.height > 120,
        enLaBarra: Boolean(caja.closest(".topbar")),
        sin: document.querySelector(".topbar").dataset.sin ?? "?",
        caja: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      };
    });
    if (!d) fallos.push(`a ${w} px, al pulsar el Pulso no sale su detalle`);
    else {
      if (!d.visto) fallos.push(`a ${w} px el detalle del Pulso está pero no se ve: algo lo tapa o lo recorta`);
      if (!d.dentro) fallos.push(`a ${w} px el detalle del Pulso se sale de la ventana (${d.caja.join(", ")})`);
      if (d.enLaBarra) fallos.push("el detalle del Pulso vuelve a montarse dentro de la barra");
      if (d.sin !== antesDeAbrir) fallos.push(`a ${w} px, abrir el Pulso le quita piezas a la barra (de «${antesDeAbrir}» a «${d.sin}»)`);
      const [x, y, an, al] = d.caja;
      const ruta = `${DIR}pulso-${w}.png`;
      await page.screenshot({ path: ruta, clip: { x: Math.max(0, x - 40) * k, y: 0, width: (an + 80) * k, height: (y + al + 30) * k } });
      fotos.push(ruta);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    if (await page.evaluate(() => Boolean(document.querySelector(".pulso-detalle")))) fallos.push(`a ${w} px el detalle del Pulso no se cierra con Escape`);
  };
  await abrirPulso(1920);
  await abrirPulso(1000);
  await ancho(1920);

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
      // El nombre escrito, que es su `tab-label` (la cuenta y «beta» van aparte).
      escrito: b.querySelector(".tab-label")?.textContent ?? "",
      nombre: b.getAttribute("aria-label") ?? "",
      globo: b.dataset.tip ?? "",
    })),
  );
  if (pestanas.length < 4) fallos.push(`solo hay ${pestanas.length} pestañas: la prueba no prueba nada`);
  for (const p of pestanas) {
    if (p.escrito !== p.nombre) fallos.push(`la pestaña ${p.clave} lleva escrito «${p.escrito}» y se llama «${p.nombre}»`);
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
    const quiere = ahora.includes("pestanas") ? 0 : m.pestanas;
    if (m.nombres !== quiere) fallos.push(`a ${w} px se ven ${m.nombres} nombres de pestaña y tenían que ser ${quiere} (sin «${m.sin}»)`);
    if (m.nombresCortados) fallos.push(`a ${w} px hay ${m.nombresCortados} nombres de pestaña cortados (sin «${m.sin}»)`);
    const vuelve = antes.filter((p) => !ahora.includes(p));
    if (vuelve.length) fallos.push(`a ${w} px vuelve ${vuelve.join(", ")}, que con más ancho ya se había quitado`);
    antes = ahora;
  }
  const peor = await medir();
  // Al lado de Adeo no va «Adeorq», en ningún ancho (Munir, 2026-10-12).
  const marca = await page.evaluate(() => (document.querySelector(".brand")?.textContent ?? "").trim());
  if (/adeorq/i.test(marca)) fallos.push(`al lado de Adeo vuelve a poner «${marca}»`);
  if (peor.acciones.length !== 3) fallos.push(`salen ${peor.acciones.length} botones de la Cabina y no tres: no está el peor caso`);
  for (const b of peor.acciones) {
    if (b.escrito) fallos.push(`el botón «${b.nombre}» de la Cabina lleva su nombre escrito: van solo con el icono`);
    if (!b.globo) fallos.push(`el botón «${b.nombre}» de la Cabina no tiene globo que diga qué hace`);
  }
  if (!peor.pulso || !peor.musica || peor.cuenta !== "1") {
    fallos.push(`no está el peor caso (pulso ${peor.pulso}, música ${peor.musica}, cuenta ${peor.cuenta})`);
  }
  // Se resume en tramos: { "sin «titulo musica»": "1100-1400", … }.
  const enTramos = (porAncho) => {
    const tramos = {};
    for (const [w, sin] of Object.entries(porAncho).sort((a, b) => a[0] - b[0])) {
      const clave = `sin «${sin}»`;
      tramos[clave] = tramos[clave] ? tramos[clave].replace(/-\d+$|$/, `-${w}`) : w;
    }
    return tramos;
  };
  const tramos = enTramos(quitado);

  // 3. Y sin música, que es como está la barra casi todo el día: desde qué
  //    ancho se leen los nombres de las pestañas. Con fotos de la franja, para
  //    mirarla y no solo medirla (caen en `.playwright-mcp/`).
  const foto = async (w, nombre) => {
    await ancho(w);
    await page.screenshot({ path: `${DIR}${nombre}.png`, clip: { x: 0, y: 0, width: Math.round(w * k), height: Math.round(64 * k) } });
    fotos.push(`${DIR}${nombre}.png`);
  };
  await foto(1920, "barra-1920-musica");
  await foto(1536, "barra-1536-musica");
  await page.evaluate(() => { window.__musica = false; });
  await ancho(1920);
  await page.waitForTimeout(4800);
  if ((await medir()).musica) fallos.push("la música no se apagó: el tramo sin música no prueba nada");
  const callado = {};
  for (let w = 1920; w >= 940; w -= 20) {
    await ancho(w);
    const m = await medir();
    callado[w] = m.sin;
    if (m.desborda > 1 || m.sobra < 0) fallos.push(`sin música, a ${w} px se desborda ${Math.max(m.desborda, -m.sobra)} px (sin «${m.sin}»)`);
    const quiere = m.sin.split(" ").includes("pestanas") ? 0 : m.pestanas;
    if (m.nombres !== quiere || m.nombresCortados) fallos.push(`sin música, a ${w} px se ven ${m.nombres} nombres (${m.nombresCortados} cortados) y tenían que ser ${quiere}`);
  }
  await foto(1920, "barra-1920");
  await foto(1536, "barra-1536");
  await foto(1280, "barra-1280");
  return { sinMusica1920: sinMusica.sin, conMusica1920: conMusica.sin, tramos, tramosSinMusica: enTramos(callado), fotos, fallos };
}
