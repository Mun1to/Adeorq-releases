// Los mods del usuario sobre la interfaz de verdad (META 14, `docs/contexto/mods.md`).
//
// Carga la app con el doble y unos mods sembrados, y mide lo que
// `scripts/mods-check.ts` no puede medir sin un navegador.
//
// Lo de aplicar: que con el interruptor apagado no se pide ni se pone nada; que
// encendido los botones de solo icono salen redondos y lo demás no se mueve;
// que los avatares de proyecto NO son iconos y tienen su propio nombre; que la
// hoja de los mods se queda la ÚLTIMA aunque la app siga metiendo hojas después
// de arrancar (la primera vez no lo era: xterm y la hoja del lienzo llegaban
// detrás); que cada mod sale en su estado y queda dicho en el rastro; y que un
// mod que llega o se va se nota solo, sin tocar nada (se mira la carpeta cada
// cuatro segundos) y también al volver el foco.
//
// Lo de la cara (Ajustes > Mods): que la lista enseña lo que hay también con
// los mods apagados; encender y apagar todos, y uno; quitar uno, con su
// segundo clic; pasarle a tu agente el que ya no engancha (se escribe la guía,
// se escribe UNA línea en la terminal sin enviarla y te lleva a la Cabina); y
// la tecla de emergencia, que los apaga aunque no se vea ni Ajustes.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y en una página
// recién abierta:
//
//   const src = await page.evaluate(async () => (await import("/scripts/laboratorio/mods.js?raw")).default);
//   return await (0, eval)(src)(page);
//
// Devuelve { mal, casos, fotos }. `mal` es cuántos casos fallan; las fotos
// (`mods-apagado.png`, `mods-iconos-redondos.png`, `mods-avatares.png` y
// `mods-ajustes.png`) caen en `.playwright-mcp/`.
async (page) => {
  const DIR = "C:/proyectos/Adeorq/.playwright-mcp/";
  const MOD = {
    id: "iconos-redondos", nombre: "iconos-redondos", pedido: "quiero los iconos redondos",
    hechoPara: "0.9.192", toca: ["--r-icono"], hoja: ":root {\n  --r-icono: 999px;\n}\n", fallo: null,
  };
  const AVATARES = { ...MOD, id: "avatares-redondos", nombre: "avatares-redondos", pedido: "y los proyectos también", toca: ["--r-avatar"], hoja: ":root { --r-avatar: 999px; }" };
  const VIEJO = { ...MOD, id: "esquinas-viejas", nombre: "esquinas-viejas", pedido: "quiero las esquinas de antes", toca: ["--r-icono", "--r-que-ya-no-existe"], hoja: ":root { --r-que-ya-no-existe: 2px; }" };
  const MALO = { ...MOD, id: "con-red", nombre: "con-red", hoja: "", fallo: "la hoja lleva un url() que no es data: un mod no pide nada a la red" };

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.setViewportSize({ width: 1920, height: 1080 });

  const cmd = (id) => ["cmd.exe", "/k", `chcp 65001 >nul && claude --permission-mode acceptEdits --session-id ${id}`];
  const SEMBRADO = JSON.stringify({
    panes: [
      { name: "Adeorq · barra", cwd: "C:\\proyectos\\Adeorq", command: cmd("11111111-2222-4333-8444-555555555555") },
      { name: "Adeorq · campana", cwd: "C:\\proyectos\\Adeorq", command: cmd("21111111-2222-4333-8444-555555555555") },
      { name: "VoCript · dictado", cwd: "C:\\proyectos\\VoCript", command: cmd("31111111-2222-4333-8444-555555555555") },
    ],
    cols: [{ w: 0.5, hs: [1, 1], idx: [0, 1] }, { w: 0.5, hs: [1], idx: [2] }],
    ocultos: [],
  });
  // DESPUÉS del guion del doble, que vacía el almacenamiento en cada carga: el
  // caso y sus mods viajan en `sessionStorage`, que sí aguanta la recarga.
  await page.addInitScript((texto) => {
    try {
      localStorage.setItem("adeorq-layout", texto);
      if ((sessionStorage.getItem("__caso") || "apagado") !== "apagado") localStorage.setItem("adeorq-mods", "1");
      window.__modsDeMentira = JSON.parse(sessionStorage.getItem("__modsDeMentira") || "[]");
      window.__version = "0.9.193";
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
  }, SEMBRADO);

  const medir = () => page.evaluate(() => {
    const radio = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return "(no está)";
      const cs = getComputedStyle(e);
      return cs.borderTopLeftRadius === cs.borderTopRightRadius ? cs.borderTopLeftRadius : `${cs.borderTopLeftRadius} ${cs.borderTopRightRadius}`;
    };
    return {
      hoja: document.getElementById("adeorq-mods")?.textContent ?? null,
      ultima: document.head.lastElementChild?.id ?? "",
      paneBtn: radio(".pane-btn"), tab: radio(".tab"), mini: radio(".mini"), franja: radio(".franja-btn"),
      // El avatar pegado a su fila: de fábrica, redondo por la izquierda y casi recto por la derecha.
      avatar: radio(".project-mark .pavatar"),
      // Lo que NO es un botón de solo icono ni un avatar: la pastilla del modelo y el panel.
      pastilla: radio(".pane-brain, .pane-kind, .pane-proj, .count"), pane: radio(".pane"),
      mods: (window.__mods ?? []).map((m) => `${m.id}:${m.estado}${m.sueltas.length ? `(${m.sueltas.join(",")})` : ""}`),
      pedidos: window.__llamadas.filter(([c]) => c === "mods_leer").length,
      rastro: window.__llamadas.filter(([c]) => c === "anotar_rastro").map(([, a]) => a.mensaje),
      encendido: localStorage.getItem("adeorq-mods"),
      vista: document.querySelector('.tabs .tab[data-active="true"]')?.getAttribute("data-tab") ?? "",
    };
  });

  const fotos = [];
  const foto = async (nombre) => {
    await page.screenshot({ path: DIR + nombre });
    fotos.push(DIR + nombre);
  };
  const pasada = async (caso, mods, nombreFoto) => {
    await page.evaluate(([c, m]) => {
      sessionStorage.setItem("__caso", c);
      sessionStorage.setItem("__modsDeMentira", JSON.stringify(m));
    }, [caso, mods]);
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="cabina"]').waitFor({ timeout: 20000 });
    await page.evaluate(() => document.querySelector('[data-tab="cabina"]')?.click());
    // Dos segundos: lo que tardan en llegar las hojas de las piezas que se
    // cargan al abrirlas. Medir antes da por última una hoja que luego no lo es.
    await page.waitForTimeout(2000);
    if (nombreFoto) await foto(nombreFoto);
    return medir();
  };

  // ── Aplicar ──────────────────────────────────────────────────────────────
  const apagado = await pasada("apagado", [MOD], "mods-apagado.png");
  const encendido = await pasada("encendido", [MOD], "mods-iconos-redondos.png");
  const avatares = await pasada("avatares", [AVATARES], "mods-avatares.png");
  const mezcla = await pasada("mezcla", [MALO, VIEJO, MOD], null);
  // Un mod que se va con la ventana delante: se nota solo, sin foco ni clic.
  await page.evaluate(() => { window.__modsDeMentira = []; });
  await page.waitForTimeout(4600);
  const solo = await medir();
  // Y uno que llega mientras mirabas otra cosa: al volver el foco, ya está.
  await page.evaluate((m) => {
    window.__modsDeMentira = [m];
    window.dispatchEvent(new Event("focus"));
  }, MOD);
  await page.waitForTimeout(400);
  const alVolver = await medir();

  // ── La cara: Ajustes > Mods ──────────────────────────────────────────────
  const texto = (b) => b.textContent.trim();
  const irAMods = async () => {
    await page.evaluate(() => document.querySelector('[data-tab="ajustes"]')?.click());
    await page.waitForTimeout(500);
    await page.evaluate(() => [...document.querySelectorAll(".set-tab")].find((b) => b.textContent.trim().startsWith("Mods"))?.click());
    await page.waitForTimeout(700);
  };
  // Pulsa un botón de la sección por su rótulo; con `mod`, el de la fila de ese mod.
  const pulsar = (rotulo, mod) => page.evaluate(([r, m]) => {
    const seccion = [...document.querySelectorAll(".set-hoja .panel-card")].find((c) => c.querySelector("h2")?.textContent.trim() === "Mods");
    const donde = m ? [...seccion.querySelectorAll(".mcp-cliente")].find((f) => f.querySelector("b")?.textContent.trim() === m) : seccion;
    const boton = donde && [...donde.querySelectorAll("button.choice")].find((b) => b.textContent.trim() === r);
    boton?.click();
    return Boolean(boton);
  }, [rotulo, mod ?? null]);
  const filas = () => page.evaluate(() =>
    [...document.querySelectorAll(".set-hoja .mcp-cliente")].map((f) => ({
      mod: f.querySelector("b")?.textContent.trim() ?? "",
      estado: f.querySelector(".mod-estado")?.textContent.trim() ?? "",
      tipo: f.querySelector(".mod-estado")?.getAttribute("data-estado") ?? "",
      botones: [...f.querySelectorAll("button.choice")].map((b) => b.textContent.trim()),
    })),
  );
  const fila = (lista, mod) => lista.find((f) => f.mod === mod) ?? { estado: "(no está)", tipo: "", botones: [] };

  await pasada("apagado", [MALO, VIEJO, MOD], null);
  await irAMods();
  const conTodoApagado = { filas: await filas(), ...(await medir()) };
  await pulsar("Encendidos");
  await page.waitForTimeout(500);
  const trasEncender = { filas: await filas(), ...(await medir()) };
  await foto("mods-ajustes.png");

  await pulsar("Apagar", "iconos-redondos");
  await page.waitForTimeout(400);
  const trasApagarUno = { filas: await filas(), ...(await medir()) };
  await pulsar("Encender", "iconos-redondos");
  await page.waitForTimeout(400);
  const trasEncenderUno = { filas: await filas(), ...(await medir()) };

  // Quitar pide un segundo clic, y «No» lo deja como estaba.
  await pulsar("Quitar", "con-red");
  await page.waitForTimeout(200);
  const preguntando = fila(await filas(), "con-red").botones;
  await pulsar("No", "con-red");
  await page.waitForTimeout(200);
  const trasElNo = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "mods_quitar").length);
  await pulsar("Quitar", "con-red");
  await page.waitForTimeout(200);
  await pulsar("Sí, a la papelera", "con-red");
  await page.waitForTimeout(500);
  const trasQuitar = {
    filas: await filas(),
    quitados: await page.evaluate(() => window.__llamadas.filter(([c]) => c === "mods_quitar").map(([, a]) => a.id)),
  };

  // Pasárselo al agente: la guía, UNA línea escrita en la terminal, y a la Cabina.
  const escritoAntes = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "pty_write").length);
  await pulsar("Pasárselo a tu agente", "esquinas-viejas");
  await page.waitForTimeout(700);
  const alAgente = await page.evaluate((antes) => {
    const escritos = window.__llamadas.filter(([c]) => c === "pty_write").slice(antes).map(([, a]) => a.data);
    return { escritos, guia: window.__guiaDeMods ?? "" };
  }, escritoAntes);
  const trasPasarlo = await medir();

  // La tecla de emergencia, desde la Cabina y sin Ajustes delante.
  await page.keyboard.press("Control+Alt+Shift+Digit0");
  await page.waitForTimeout(500);
  const trasLaTecla = await medir();

  const estados = (r) => r.filas.map((f) => `${f.mod}:${f.tipo}`).join(" ");
  const casos = [
    ["apagado: ni se pide la carpeta ni hay hoja", apagado.pedidos === 0 && apagado.hoja === null],
    ["apagado: cada botón de icono, con su escalón", apagado.paneBtn === "4px" && apagado.tab === "6px" && apagado.mini === "6px" && apagado.franja === "6px"],
    ["encendido: los botones de icono son redondos", [encendido.paneBtn, encendido.tab, encendido.mini, encendido.franja].every((v) => v === "999px")],
    ["encendido: lo que no es un botón de icono no cambia", apagado.pastilla !== "(no está)" && encendido.pastilla === apagado.pastilla && encendido.pane === apagado.pane],
    ["encendido: la hoja de los mods es la última del documento", encendido.ultima === "adeorq-mods"],
    ["un avatar no es un icono: con «iconos redondos» sigue como estaba", apagado.avatar === "6px 3px" && encendido.avatar === apagado.avatar],
    ["«avatares redondos» los redondea enteros y no toca los iconos", avatares.avatar === "999px" && avatares.paneBtn === "4px" && avatares.mods.join() === "avatares-redondos:aplicado"],
    ["mezcla: cada uno en su estado", mezcla.mods.join(" ") === "con-red:rechazado esquinas-viejas:no_engancha(--r-que-ya-no-existe) iconos-redondos:aplicado"],
    ["mezcla: queda dicho en el rastro", mezcla.rastro.some((l) => l.includes("esquinas-viejas ya no engancha") && l.includes("con-red rechazado"))],
    ["un mod que se va se nota solo en unos segundos, sin foco", solo.hoja === null && solo.paneBtn === "4px"],
    ["y uno que llega está puesto al volver el foco", alVolver.paneBtn === "999px"],

    ["Ajustes, con todo apagado: enseña lo que hay en la carpeta y no aplica nada", estados(conTodoApagado) === "con-red:rechazado esquinas-viejas:no_engancha iconos-redondos:aplicado" && conTodoApagado.hoja === null && fila(conTodoApagado.filas, "iconos-redondos").estado === "Listo para cuando los enciendas"],
    ["Ajustes: «Encendidos» los pone en el acto y lo recuerda", trasEncender.paneBtn === "999px" && trasEncender.encendido === "1" && fila(trasEncender.filas, "iconos-redondos").estado === "Puesto"],
    ["Ajustes: cada fila dice lo que le pasa", fila(trasEncender.filas, "con-red").estado.startsWith("No se carga: la hoja lleva un url()") && fila(trasEncender.filas, "esquinas-viejas").estado === "Ya no engancha: --r-que-ya-no-existe no existe en esta versión"],
    ["Ajustes: solo el que falla lleva «Pasárselo a tu agente»", fila(trasEncender.filas, "esquinas-viejas").botones.includes("Pasárselo a tu agente") && fila(trasEncender.filas, "con-red").botones.includes("Pasárselo a tu agente") && !fila(trasEncender.filas, "iconos-redondos").botones.includes("Pasárselo a tu agente")],
    ["Ajustes: apagar uno lo quita y deja los demás", trasApagarUno.paneBtn === "4px" && fila(trasApagarUno.filas, "iconos-redondos").tipo === "apagado" && trasApagarUno.hoja?.includes("esquinas-viejas")],
    ["Ajustes: encenderlo lo vuelve a poner", trasEncenderUno.paneBtn === "999px" && fila(trasEncenderUno.filas, "iconos-redondos").tipo === "aplicado"],
    ["Ajustes: quitar pregunta antes, y «No» no quita nada", preguntando.includes("Sí, a la papelera") && preguntando.includes("No") && trasElNo === 0],
    ["Ajustes: quitar de verdad pide ESE mod y lo saca de la lista", trasQuitar.quitados.join() === "con-red" && !trasQuitar.filas.some((f) => f.mod === "con-red") && trasQuitar.filas.length === 2],
    ["al agente: se escribe la guía de esta versión", alAgente.guia.includes("Adeorq 0.9.193") && alAgente.guia.includes("`--r-avatar`")],
    ["al agente: UNA línea en la terminal, sin enviar", alAgente.escritos.length === 1 && !/[\r\n]/.test(alAgente.escritos[0]) && alAgente.escritos[0].startsWith("Lee C:\\Users\\tu\\AppData\\Local\\Adeorq\\mods\\LEEME.md y rehaz mi mod de Adeorq «esquinas-viejas»") && alAgente.escritos[0].includes("«quiero las esquinas de antes»")],
    ["al agente: te lleva a la Cabina, donde se ve llegar", trasPasarlo.vista === "cabina"],
    ["la tecla de emergencia los apaga todos, sin Ajustes delante", trasLaTecla.hoja === null && trasLaTecla.paneBtn === "4px" && trasLaTecla.encendido === null],
  ].map(([nombre, ok]) => ({ nombre, ok: Boolean(ok) }));

  return {
    mal: casos.filter((c) => !c.ok).length, casos, fotos,
    medidas: { apagado, encendido, avatares, mezcla, solo, alVolver, conTodoApagado, trasEncender, trasApagarUno, trasEncenderUno, preguntando, trasQuitar, alAgente, trasPasarlo, trasLaTecla },
  };
}
