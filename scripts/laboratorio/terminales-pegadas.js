// «Pegadas» pega de verdad: entre dos terminales vecinas de la Cabina no queda
// ni un píxel por el que se vea lo de detrás, y sin esquinas, en los cuatro
// estilos. Y «Tarjetas sueltas» sigue dejando su hueco en el Cristal.
//
//   node node_modules/vite/bin/vite.js --port 1420 --strictPort --host 127.0.0.1
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/terminales-pegadas.js
//   (con FOTO=<carpeta>, una foto de la rejilla por estilo y forma; con
//   TEMA=<id> (contraste, violeta…), con ese tema puesto)
//
// Munir, 2026-11-25, con «Pegadas» puesta en Ajustes y el estilo Cristal: «hay
// un hueco y en ajustes no puedes cambiar que no haya hueco y estén las
// terminales las unas pegadas con las otras». Era la forma de Contraste
// (`41-contraste.css`, la de todos los temas desde el 17-nov), que da a cada
// terminal de la rejilla 4 px de borde transparente y una esquina de 12: con
// «Pegadas», que es la forma sin atributo, no había nada que la pisara.
//
// POR QUÉ NO VALE `getBoundingClientRect` A PELO: ese hueco se come POR DENTRO
// del panel (un borde transparente con `background-clip: padding-box`, para que
// la rejilla no se mueva), así que las cajas de dos vecinas se tocan siempre,
// también con el fallo. Se mide la caja PINTADA: la del panel menos cada borde
// que no pinta nada (transparente y con el fondo recortado por dentro de él).
//
// Lo que se exige:
//   - «Pegadas», en los cuatro estilos: 0 px pintados entre vecinas, en
//     horizontal y en vertical, y ninguna esquina redonda.
//   - «Tarjetas sueltas», en el Cristal: hueco entre vecinas (4 px o más).
//   - En Terminal, Consola y Liso la forma de Ajustes no cuenta (es del
//     Cristal, `42-aspectos.css`): las tres formas salen pegadas y cuadradas.
// Las demás medidas (las suaves del Cristal) salen en `medidas` para mirarlas.
//
// Con su propio doble de Tauri, como `aro-tinta.js`: cuatro terminales en dos
// columnas, para tener vecinas a los dos lados. Devuelve { medidas, fallos }.
async (page) => {
  const ORIGEN = /^https?:/.test(page.url()) ? new URL(page.url()).origin : "http://127.0.0.1:1420";
  const ESTILOS = ["cristal", "terminal", "consola", "liso"];
  const FORMAS = ["pegadas", "suaves", "tarjetas"];
  const FOTO = globalThis.process?.env?.FOTO;
  const TEMA = globalThis.process?.env?.TEMA;
  const fallos = [];
  const medidas = {};

  await page.addInitScript((tema) => {
    // Sin tema guardado, la app sigue a Windows (`lib/temaSistema.ts`), y el
    // navegador de pruebas va en claro: con TEMA se apaga eso en cada carga,
    // antes de que arranque la app, para que mande el pedido.
    if (tema) {
      localStorage.setItem("adeorq-theme", tema);
      localStorage.setItem("adeorq-tema-sistema", JSON.stringify({ activo: false, oscuro: tema, claro: "papel" }));
    }
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    localStorage.setItem(
      "adeorq-layout",
      JSON.stringify({
        panes: ["Uno", "Dos", "Tres", "Cuatro"].map((name) => ({ name, cwd: "C:\\proyectos\\Adeorq" })),
        cols: [
          { w: 0.5, hs: [1, 1], idx: [0, 1] },
          { w: 0.5, hs: [1, 1], idx: [2, 3] },
        ],
        ocultos: [],
      }),
    );
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen":
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
  }, TEMA ?? "");

  /** Las cajas pintadas de las terminales de la rejilla y lo que hay entre vecinas. */
  const medir = () =>
    page.evaluate(() => {
      // El alfa de un color tal como lo devuelve el navegador: `rgba(…)`,
      // `rgb(…)` o, si viene de un `color-mix`, `color(srgb r g b / a)`.
      const alfa = (c) => {
        if (!c || c === "transparent") return 0;
        const m = c.match(/rgba?\(([^)]+)\)/) ?? c.match(/color\(srgb ([^)]+)\)/);
        if (!m) return 1;
        const p = m[1].split(/[\s,/]+/).filter(Boolean);
        return p.length >= 4 ? Number(p[3]) : 1;
      };
      const px = (v) => parseFloat(v) || 0;
      const paneles = [...document.querySelectorAll(".grid > .pane")].map((p) => {
        const r = p.getBoundingClientRect();
        const s = getComputedStyle(p);
        // El color del fondo se recorta con la ÚLTIMA capa de `background-clip`.
        const clip = s.backgroundClip.split(",").pop().trim();
        // Un borde deja ver lo de detrás si no pinta nada y el fondo del panel
        // no llega por debajo de él.
        const hueco = (lado) => (alfa(s[`border${lado}Color`]) > 0 || clip === "border-box" ? 0 : px(s[`border${lado}Width`]));
        return {
          caja: { l: r.left, t: r.top, r: r.right, b: r.bottom },
          pintada: { l: r.left + hueco("Left"), t: r.top + hueco("Top"), r: r.right - hueco("Right"), b: r.bottom - hueco("Bottom") },
          radio: Math.max(...["TopLeft", "TopRight", "BottomLeft", "BottomRight"].map((k) => px(s[`border${k}Radius`]))),
        };
      });
      const solapan = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 10;
      const enFila = [];
      const enColumna = [];
      for (const a of paneles)
        for (const b of paneles) {
          if (a === b) continue;
          if (Math.abs(a.caja.r - b.caja.l) < 1.5 && solapan(a.caja.t, a.caja.b, b.caja.t, b.caja.b))
            enFila.push(+(b.pintada.l - a.pintada.r).toFixed(2));
          if (Math.abs(a.caja.b - b.caja.t) < 1.5 && solapan(a.caja.l, a.caja.r, b.caja.l, b.caja.r))
            enColumna.push(+(b.pintada.t - a.pintada.b).toFixed(2));
        }
      return {
        paneles: paneles.length,
        aspecto: document.documentElement.dataset.aspecto ?? "cristal",
        forma: document.documentElement.dataset.panes ?? "pegadas",
        enFila,
        enColumna,
        radio: Math.max(0, ...paneles.map((p) => p.radio)),
      };
    });

  await page.goto(`${ORIGEN}/`);
  for (const estilo of ESTILOS) {
    for (const forma of FORMAS) {
      const caso = `${estilo} ${forma}`;
      await page.evaluate(
        ([estilo, forma, tema]) => {
          if (estilo === "cristal") localStorage.removeItem("adeorq-aspecto");
          else localStorage.setItem("adeorq-aspecto", estilo);
          localStorage.setItem("adeorq-forma-paneles", forma);
        },
        [estilo, forma],
      );
      await page.reload();
      const tab = page.locator('[data-tab="cabina"]');
      await tab.waitFor({ timeout: 20000 });
      await tab.click();
      const salieron = await page
        .waitForFunction(() => document.querySelectorAll(".grid > .pane .xterm-screen").length >= 4, null, { timeout: 15000 })
        .then(
          () => true,
          () => false,
        );
      if (!salieron) {
        fallos.push(`${caso}: no salieron las cuatro terminales (el banco no ha medido)`);
        continue;
      }
      await page.waitForTimeout(400);
      const m = await medir();
      medidas[caso] = m;
      if (FOTO) {
        const g = await page.locator(".grid").boundingBox();
        await page.screenshot({ path: `${FOTO}/${estilo}-${forma}.png`, clip: g, animations: "disabled", caret: "hide" });
      }

      if (m.aspecto !== estilo || m.forma !== forma) fallos.push(`${caso}: la página no tiene puesto lo pedido (${m.aspecto} ${m.forma})`);
      if (m.enFila.length < 2 || m.enColumna.length < 2) {
        fallos.push(`${caso}: no encontré las vecinas (${m.enFila.length} en fila, ${m.enColumna.length} en columna)`);
        continue;
      }
      const todas = [...m.enFila, ...m.enColumna];
      const pegada = estilo !== "cristal" || forma === "pegadas";
      if (pegada) {
        const peor = Math.max(...todas.map(Math.abs));
        if (peor > 0.5) fallos.push(`${caso}: hay ${peor} px sin pintar entre dos vecinas (en fila ${m.enFila.join(", ")}; en columna ${m.enColumna.join(", ")})`);
        if (m.radio > 0) fallos.push(`${caso}: las terminales llevan esquina redonda (${m.radio} px)`);
      }
      if (estilo === "cristal" && forma === "tarjetas" && Math.min(...todas) < 4)
        fallos.push(`${caso}: las tarjetas sueltas ya no dejan hueco (${todas.join(", ")})`);
    }
  }
  return { medidas, fallos };
}
