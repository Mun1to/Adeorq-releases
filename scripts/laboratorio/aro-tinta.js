// ¿Pinta el aro de estado encima de lo que dibuja la terminal? Contado en
// píxeles de la pantalla, no leído en las hojas ni deducido de la geometría.
//
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/aro-tinta.js
//   (con la app servida en localhost:1420: `pnpm dev`, o el front construido
//   con `vite preview --port 1420`)
//
// Con su propio Brave a propósito, y no con el MCP de Playwright: siembra un
// doble de Tauri y un `adeorq-layout` con `addInitScript`, que en el navegador
// compartido se quedarían puestos para las demás sesiones. Si ya hay una página
// abierta en la app, usa su origen.
//
// El aro (`.pane-aro`, `05-cabina.css`) va por dentro del panel y ENCIMA de la
// terminal, y la terminal le deja un hueco con padding en `.xterm`. Ese hueco
// se perdió dos veces (2026-11-22): primero se comía la primera letra de cada
// línea y luego la última fila. `scripts/aro-check.ts` lee las hojas y no puede
// ver todo: una revisión encontró CSS que lo esquivaban (un `border`, un
// `outline`, un `filter` o un `::after` en el aro, quitarle la máscara al
// tramo, mover el lienzo de xterm con `translate`…). Un primer banco que medía
// la geometría tampoco veía cinco de ellos. Aquí se fotografía lo que sale.
//
// En la Cabina, para cada estilo, forma de los paneles, sobrante de alto
// (encogiendo la rejilla) y estado (necesita, trabaja y el foco), cuatro
// fotos de cada panel, con la terminal llena de bloques verdes de borde a
// borde (un color que no usa ningún estado) y el tramo de «trabaja» quieto y en
// su color más vivo:
//   C  vacía y sin estado      B  llena y sin estado
//   D  vacía y con el estado   A  llena y con el estado
// Un píxel es tinta si B ≠ C, es del aro si D ≠ C, y está PISADO si es las dos
// cosas y además A ≠ B. Así no cuenta el ruido de lo que cambia con el estado
// fuera de la terminal (la cabecera, la barra de Consola). «≠» es más de 40 en
// algún canal para la tinta y más de 3 para el aro y lo pisado: con 12, un halo
// del aro al 8 % sobre la tinta pasaba en verde (revisión del 2026-11-22; con 3
// el control sale igual de limpio).
//
// La única excepción, con nombre: en Cristal con «trabaja», hasta 2 píxeles en
// la esquina de abajo a la izquierda. Su esquina interior de 8 px deja el hueco
// del tramo con 5 de radio, y la primera celda de la última fila empieza a 4,4:
// el canto de un bloque que llene esa celda se tiñe (medido el 2026-11-22: 1
// píxel a ciertos altos, a 100 % y a 125 %). Se apunta en `roces`; cualquier
// otro píxel pisado es un fallo.
//
// NO mide el Lienzo ni la ventana suelta: con este doble no les sale ninguna
// terminal (`vistas: ["lienzo"]` lo intenta y lo apunta en `noVisto`). Una
// regla que solo toque `.rf-term` pasa sin que este banco lo vea. Tampoco mide
// el estado «terminó» (solo necesita, trabaja y foco), las animaciones (las
// fotos van con `animations: "disabled"`, que cancela las infinitas: un
// `@keyframes` que engorde el aro pasa en verde) ni lo que solo vale con menos
// movimiento, el tema claro o el modo rendimiento.
//
// Devuelve { casos, roces, noVisto, fallos }: `fallos` vacío es que el aro no
// pisa la terminal en nada de lo medido. Una vuelta entera tarda unos minutos;
// con un segundo argumento se acota (`{ estilos: ["terminal"], formas:
// ["pegadas"], encoge: [0, 2, 4], estados: ["trabaja"] }`).
async (page, acotar = {}) => {
  const ORIGEN = /^https?:/.test(page.url()) ? new URL(page.url()).origin : "http://localhost:1420";
  const VISTAS = acotar.vistas ?? ["cabina"];
  const ESTILOS = acotar.estilos ?? ["cristal", "terminal", "consola", "liso"];
  const FORMAS = acotar.formas ?? ["pegadas", "suaves", "tarjetas"];
  const ESTADOS = acotar.estados ?? ["necesita", "trabaja", "foco"];
  const ENCOGE = acotar.encoge ?? [0, 1, 2, 3, 4, 5, 6, 8, 12, 16, 20, 24];
  const fallos = [];
  const roces = [];
  const noVisto = [];
  let casos = 0;

  await page.addInitScript(() => {
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    localStorage.setItem(
      "adeorq-layout",
      JSON.stringify({
        panes: [
          { name: "Uno", cwd: "C:\\proyectos\\Adeorq" },
          { name: "Dos", cwd: "C:\\proyectos\\Adeorq" },
        ],
        cols: [
          { w: 0.5, hs: [1], idx: [0] },
          { w: 0.5, hs: [1], idx: [1] },
        ],
        ocultos: [],
      }),
    );
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const oyentes = {};
    window.__emitir = (evento, payload) => {
      for (const h of oyentes[evento] ?? []) window[`_${h}`]?.({ event: evento, id: h, payload });
    };
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen":
          (oyentes[args.event] ??= []).push(args.handler);
          return args.handler;
        case "plugin:event|unlisten":
        case "pty_spawn":
        case "pty_resize":
        case "pty_write":
          return null;
        case "list_projects":
          return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
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

  // El tramo de «trabaja», quieto y en su color más vivo en todo el anillo: la
  // misma geometría (la pone la máscara), el peor color.
  const QUIETO = `.pane[data-estado="trabaja"] > .pane-aro > i{background:color-mix(in srgb,var(--estado-trabaja) 45%,#fff)!important;animation:none!important}`;
  const VERDE = "\x1b[38;2;0;255;0m";
  const llena = `\x1b[?25l\x1b[?7l\x1b[2J${Array.from({ length: 160 }, (_, i) => `\x1b[${i + 1};1H${VERDE}${"█".repeat(420)}`).join("")}\x1b[0m\x1b[?7h`;
  const vacia = "\x1b[?25l\x1b[0m\x1b[2J\x1b[H";

  const paneles = (vista) => (vista === "cabina" ? ".grid > .pane" : ".rf-term .pane");
  // Hasta que el lienzo de cada terminal lleva tres lecturas sin moverse:
  // FitAddon reajusta después del ResizeObserver, y con la máquina cargada tarda.
  const asentar = async (sel) => {
    const foto = () =>
      page.evaluate((sel) => JSON.stringify([...document.querySelectorAll(`${sel} .xterm-screen`)].map((s) => Object.values(s.getBoundingClientRect().toJSON()))), sel);
    await page.waitForTimeout(500);
    let quietas = 0;
    let antes = await foto();
    for (let i = 0; i < 40 && quietas < 3; i++) {
      await page.waitForTimeout(200);
      const ahora = await foto();
      quietas = ahora === antes ? quietas + 1 : 0;
      antes = ahora;
    }
  };
  const escribir = async (sel, data) => {
    const ids = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((p) => Number(p.dataset.paneId)), sel);
    for (const id of ids) await page.evaluate(([id, data]) => window.__emitir("pty-data", { id, data }), [id, data]);
    await page.waitForTimeout(250);
  };
  const ponerEstado = (sel, estado) =>
    page.evaluate(
      ([sel, estado]) => {
        for (const p of document.querySelectorAll(sel)) {
          if (estado && estado !== "foco") p.setAttribute("data-estado", estado);
          else p.removeAttribute("data-estado");
          p.setAttribute("data-focused", estado === "foco" ? "true" : "false");
        }
      },
      [sel, estado],
    );
  const fotos = async (sel) => {
    const cajas = await page.evaluate(
      (sel) =>
        [...document.querySelectorAll(sel)].map((p) => {
          const r = p.getBoundingClientRect();
          const s = p.querySelector(".xterm-screen")?.getBoundingClientRect();
          return { id: p.dataset.paneId, x: Math.max(0, Math.floor(r.left) - 2), y: Math.max(0, Math.floor(r.top) - 2), w: Math.ceil(r.width) + 4, h: Math.ceil(r.height) + 4, esq: s ? { x: s.left, y: s.bottom } : null };
        }),
      sel,
    );
    const out = [];
    for (const c of cajas) {
      const png = await page.screenshot({ clip: { x: c.x, y: c.y, width: c.w, height: c.h }, animations: "disabled", caret: "hide" });
      out.push({ ...c, png: png.toString("base64") });
    }
    return out;
  };
  // Cuenta en la propia página: decodifica las cuatro fotos y compara.
  const contar = (C, B, D, A, zoom) =>
    page.evaluate(
      async ([C, B, D, A, zoom]) => {
        const leer = async (b64) => {
          const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
          const cv = new OffscreenCanvas(bmp.width, bmp.height);
          const cx = cv.getContext("2d");
          cx.drawImage(bmp, 0, 0);
          return cx.getImageData(0, 0, bmp.width, bmp.height);
        };
        const [c, b, d, a] = await Promise.all([C.png, B.png, D.png, A.png].map(leer));
        const w = Math.min(c.width, b.width, d.width, a.width);
        const h = Math.min(c.height, b.height, d.height, a.height);
        let tinta = 0;
        let pisados = 0;
        let enEsquina = 0;
        const ejemplos = [];
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const i = (y * c.width + x) * 4;
            const j = (y * b.width + x) * 4;
            const k = (y * d.width + x) * 4;
            const l = (y * a.width + x) * 4;
            const esTinta = Math.max(Math.abs(b.data[j] - c.data[i]), Math.abs(b.data[j + 1] - c.data[i + 1]), Math.abs(b.data[j + 2] - c.data[i + 2])) > 40;
            if (!esTinta) continue;
            tinta++;
            const esAro = Math.max(Math.abs(d.data[k] - c.data[i]), Math.abs(d.data[k + 1] - c.data[i + 1]), Math.abs(d.data[k + 2] - c.data[i + 2])) > 3;
            const cambia = Math.max(Math.abs(a.data[l] - b.data[j]), Math.abs(a.data[l + 1] - b.data[j + 1]), Math.abs(a.data[l + 2] - b.data[j + 2])) > 3;
            if (!esAro || !cambia) continue;
            pisados++;
            // En píxeles de la foto: la esquina de abajo a la izquierda de la terminal.
            const ex = B.esq ? (B.esq.x - B.x) * zoom : -99;
            const ey = B.esq ? (B.esq.y - B.y) * zoom : -99;
            if (Math.abs(x - ex) <= 6 * zoom && Math.abs(y - ey) <= 6 * zoom) enEsquina++;
            if (ejemplos.length < 3) ejemplos.push(`${(x / zoom + B.x).toFixed(1)},${(y / zoom + B.y).toFixed(1)}`);
          }
        return { tinta, pisados, enEsquina, ejemplos };
      },
      [C, B, D, A, zoom],
    );

  await page.goto(`${ORIGEN}/`);
  const zoom = await page.evaluate(() => devicePixelRatio);
  for (const vista of VISTAS) {
    for (const estilo of ESTILOS) {
      for (const forma of vista === "cabina" ? FORMAS : [FORMAS[0]]) {
        await page.evaluate(
          ([estilo, forma]) => {
            if (estilo === "cristal") localStorage.removeItem("adeorq-aspecto");
            else localStorage.setItem("adeorq-aspecto", estilo);
            localStorage.setItem("adeorq-forma-paneles", forma);
          },
          [estilo, forma],
        );
        await page.reload();
        const tab = page.locator(`[data-tab="${vista}"]`);
        await tab.waitFor({ timeout: 20000 });
        await tab.click();
        const sel = paneles(vista);
        const cuantas = vista === "cabina" ? 2 : 1;
        const hay = (ms) =>
          page.waitForFunction(([sel, n]) => document.querySelectorAll(`${sel} .xterm-screen`).length >= n, [sel, cuantas], { timeout: ms }).then(
            () => true,
            () => false,
          );
        // En el Lienzo, si las de la Cabina no salen ahí, se abre una con «Terminal aquí».
        if (!(await hay(vista === "cabina" ? 15000 : 4000)) && vista === "lienzo") {
          await page.locator('[data-tip^="Terminal aquí"]').first().click().catch(() => {});
        }
        if (!(await hay(15000))) {
          noVisto.push(`${vista} ${estilo} ${forma}: no salió la terminal`);
          continue;
        }
        await page.addStyleTag({ content: QUIETO });
        const encoge = await page.addStyleTag({ content: "/* encoge */" });
        for (const k of vista === "cabina" ? ENCOGE : [0]) {
          await encoge.evaluate((e, k) => {
            e.textContent = k ? `.grid{margin-bottom:${k}px!important}` : "";
          }, k);
          await asentar(sel);
          await ponerEstado(sel, null);
          await escribir(sel, vacia);
          const C = await fotos(sel);
          await escribir(sel, llena);
          const B = await fotos(sel);
          for (const estado of ESTADOS) {
            await ponerEstado(sel, estado);
            await page.waitForTimeout(80);
            const A = await fotos(sel);
            await escribir(sel, vacia);
            const D = await fotos(sel);
            await escribir(sel, llena);
            await ponerEstado(sel, null);
            for (let n = 0; n < Math.min(C.length, B.length, D.length, A.length); n++) {
              casos++;
              const caso = `${vista} ${estilo} ${forma} −${k}px ${estado} panel ${B[n].id}`;
              if (B[n].w !== A[n].w || B[n].h !== A[n].h) {
                fallos.push(`${caso}: el panel cambió de tamaño entre fotos (${B[n].w}x${B[n].h} → ${A[n].w}x${A[n].h})`);
                continue;
              }
              const r = await contar(C[n], B[n], D[n], A[n], zoom);
              if (r.tinta === 0) {
                fallos.push(`${caso}: la terminal no pintó nada (el banco no ha medido)`);
                continue;
              }
              if (!r.pisados) continue;
              const conocido = estilo === "cristal" && estado === "trabaja" && r.pisados === r.enEsquina && r.pisados <= 2;
              (conocido ? roces : fallos).push(`${caso}: ${r.pisados} píxeles de tinta pisados (${r.enEsquina} en la esquina de abajo a la izquierda), p. ej. ${r.ejemplos.join(" ")}`);
            }
          }
        }
      }
    }
  }
  return { casos, roces, noVisto, fallos };
};
