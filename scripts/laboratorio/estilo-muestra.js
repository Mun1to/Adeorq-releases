// La app de verdad en seis fotos, tal cual o con OTRA escala de esquinas y sombras.
//
// Para juzgar la guía de estilo mirando la interfaz y no una maqueta: carga la
// app con el doble y fotografía la Cabina, un menú, un diálogo, la Agenda, los
// Ajustes y el chat. Si `CANDIDATA` trae valores, repite las seis con esos
// valores puestos en la raíz; nada de eso se guarda, se va al recargar.
//
// Desde el 2026-10-11 toda esquina y toda sombra de la hoja sale de cinco
// variables (`--r-chico`, `--r-btn`, `--r-caja`, `--sombra-2`, `--sombra-3`,
// más el brillo `--glass-edge`), y lo vigila `scripts/estilo-check.mjs`. Por
// eso una escala candidata es ya solo una lista de variables. La primera vez
// no era así: para enseñarle a Munir «plano con filo» sobre la app hubo que
// reescribir 767 esquinas y 82 sombras en el navegador, regla a regla. La
// eligió ese día, con el brillo de cristal de siempre, y es la que lleva la hoja.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha, en una página
// recién abierta y con una foto en `.playwright-mcp/fondo.png`:
//
//   const src = await page.evaluate(async () => (await import("/scripts/laboratorio/estilo-muestra.js?raw")).default);
//   return await (0, eval)(src)(page);
//
// Devuelve { fotos }: las rutas, `est-<pantalla>-hoy.png` y, si hay candidata,
// `est-<pantalla>-candidata.png`.
async (page) => {
  /** La escala a probar, o `null` para fotografiar la app como está. Ejemplo,
      la de antes de la guía: { "--r-chico": "8px", "--r-btn": "10px", "--r-caja": "16px" }. */
  const CANDIDATA = null;
  const DIR = "C:/proyectos/Adeorq/.playwright-mcp/";

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  // DESPUÉS del doble, que fija su propia ventana de 1440. El navegador del MCP
  // lleva zoom, así que se pide la ventana que da 1920 de página, el ancho de
  // un monitor de verdad: con menos, las terminales salen apretadas entre las
  // dos barras y la foto no se parece al uso real.
  const k = 1440 / (await page.evaluate(() => innerWidth));
  await page.setViewportSize({ width: Math.round(1920 * k), height: Math.round(1080 * k) });

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
  await page.addInitScript((texto) => {
    try {
      if (sessionStorage.getItem("__sembrar")) localStorage.setItem("adeorq-layout", texto);
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
    window.__estadoPanel = "a_medias";
  }, SEMBRADO);
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));

  const TEXTO =
    "\x1b[38;5;75m●\x1b[0m He cambiado \x1b[1msrc/lib/barraQueCabe.ts\x1b[0m\r\n  y el banco pasa en los 47 anchos.\r\n\r\n" +
    "\x1b[38;5;75m●\x1b[0m Bash(pnpm comprobar --rapido)\r\n  \x1b[38;5;244m⎿  Todo en verde: 23 comprobadores.\x1b[0m\r\n\r\n" +
    "\x1b[38;5;215m✻\x1b[0m Pensando… \x1b[38;5;244m(12s · ↓ 1.2k tokens)\x1b[0m\r\n";
  const fotos = [];
  const pasada = async (cual, escala) => {
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
    if (escala) {
      await page.evaluate((e) => {
        for (const [nombre, valor] of Object.entries(e)) document.documentElement.style.setProperty(nombre, valor);
      }, escala);
    }
    await page.locator('[data-tab="cabina"]').click();
    await page.waitForTimeout(1800);
    const ids = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => a.id));
    for (const id of ids) await page.evaluate(([i, t]) => window.__emitir("pty-data", { id: i, data: t }), [id, TEXTO]);
    await page.waitForTimeout(700);
    const foto = async (nombre) => {
      await page.waitForTimeout(250);
      const ruta = `${DIR}est-${nombre}-${cual}.png`;
      await page.screenshot({ path: ruta });
      fotos.push(ruta);
    };
    await foto("cabina");
    await page.locator(".layout-btn").click();
    await page.waitForTimeout(350);
    await foto("popover");
    await page.locator(".layout-btn").click();
    await page.locator(".tab-danger").click();
    await page.waitForTimeout(350);
    await foto("dialogo");
    await page.locator(".modal-overlay").click({ position: { x: 6, y: 6 } });
    await page.waitForTimeout(300);
    await page.locator('[data-tab="agenda"]').click();
    await page.waitForTimeout(1300);
    await foto("agenda");
    await page.locator('[data-tab="ajustes"]').click();
    await page.waitForTimeout(1100);
    await foto("ajustes");
    await page.locator('[data-tab="chat"]').click();
    await page.waitForTimeout(700);
    await page.locator(".cj-nueva").click();
    await page.waitForTimeout(500);
    await page.locator(".chat-input").fill("Arregla el scroll de las terminales y mira por qué se cae el radar");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(5200);
    await foto("chat");
  };
  await pasada("hoy", null);
  if (CANDIDATA) await pasada("candidata", CANDIDATA);
  return { fotos };
}
