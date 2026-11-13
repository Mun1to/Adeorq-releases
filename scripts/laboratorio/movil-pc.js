// La página del móvil abierta en un PC (2026-11-13, Munir desde el PC de clase:
// «la interfaz no está optimizada para PC, solo móvil, y algunas cosas se ven
// raras»). A 1366, 1440 y 1920, en oscuro y en claro, y dentro de un marco ancho
// como el de su panel (`munito-panel.pages.dev/adeorq`):
//   · el cajón va fijo a la izquierda, sin velo, y no tapa nada;
//   · lo de dentro va en una columna centrada, no de lado a lado (las listas, la
//     caja de escribir, los avisos de una terminal, una decisión y su botón);
//   · la pantalla de una terminal, más ancha y con letra de PC;
//   · las fotos de Ajustes no miden media pantalla de alto;
//   · emparejar va en medio de la ventana, y lo de borrar una conversación es
//     una ventana en medio, no una tira a todo el ancho;
//   · con el ratón, una fila responde al pasar por encima, e Intro manda
//     (Mayús+Intro baja de línea).
// Y a 390 y 360 todo sigue como en el móvil: el cajón sale con su botón, los
// márgenes de 16 px y nada se sale de lado.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-pc.js
//   (o `node scripts/laboratorio/bancos-movil.mjs movil-pc`)
//
// Con `FOTOS=<carpeta>` deja una foto de cada pantalla mirada. Devuelve
// { pasos, fallos }. Al final manda un mensaje a Adeo: va contra un doble recién arrancado.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const FOTOS = typeof process !== "undefined" ? process.env.FOTOS : null;
  const fallos = [];
  const pasos = {};
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const espera = (ms) => page.waitForTimeout(ms);
  const foto = async (nombre, donde = page) => {
    if (FOTOS) await (donde.screenshot ? donde : page).screenshot({ path: `${FOTOS}/${nombre}.png` });
  };
  const ALTO = { 1920: 1080, 1440: 900, 1366: 768, 390: 844, 360: 780 };

  // Cómo está pintado lo que importa, medido en la página (o en el marco).
  const medir = (f) => f.evaluate(() => {
    const caja = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden || !el.getClientRects().length) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left), d: Math.round(r.right), y: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const cajon = caja("#cajon");
    const velo = document.getElementById("cajon-velo");
    return {
      ancho: innerWidth, alto: innerHeight,
      seSale: document.documentElement.scrollWidth > innerWidth + 1,
      vista: caja(".vista"),
      cajon,
      cajonSeVe: !!cajon && cajon.d > 0 && cajon.x >= 0,
      veloTapa: !!velo && getComputedStyle(velo).display !== "none" && parseFloat(getComputedStyle(velo).opacity) > 0.01,
      botonCajon: (() => { const b = document.getElementById("abrir-cajon"); return !!b && getComputedStyle(b).visibility !== "hidden" && !!b.getClientRects().length; })(),
      rellenoCuerpo: (() => { const c = document.querySelector(".vista .cuerpo:not([hidden])"); return c ? parseFloat(getComputedStyle(c).paddingLeft) : null; })(),
      grupo: caja(".cuerpo .grupo") || caja(".cuerpo .tarjeta"),
      filaCaja: caja(".caja:not([hidden]) .fila-caja"),
      avisoDec: caja("#aviso-dec"),
      pregunta: caja(".pregunta-d"),
      enviarDec: caja(".enviar-dec"),
      pantalla: caja("#pantalla"),
      letraPantalla: (() => { const p = document.getElementById("pantalla"); return p ? parseFloat(getComputedStyle(p).fontSize) : null; })(),
      fotoMini: caja(".foto-op .mini"),
      // Las tres miniaturas de Ajustes: su alto y su arriba, y dónde acaba la última.
      fotos: [...document.querySelectorAll(".foto-op .mini")].map((m) => { const r = m.getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height), d: Math.round(r.right) }; }),
      grupoFotos: caja(".grupo:has(.fotos)"),
      // «Nuevo encargo» encima de la lista de proyectos del cajón.
      encargoTapa: (() => {
        const n = document.getElementById("nuevo-encargo")?.getBoundingClientRect();
        const l = document.querySelector("#cajon .recientes")?.getBoundingClientRect();
        return !!n && !!l && n.width > 0 && n.top < l.bottom - 1 && n.bottom > l.top + 1;
      })(),
      // La cifra de las decisiones del cajón contra su fondo (WCAG).
      contrasteCuenta: (() => {
        const c = document.querySelector("#cajon .cuenta-dec");
        if (!c) return null;
        const lum = (s) => { const [r, g, b] = s.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const [a, b] = [lum(getComputedStyle(c).color), lum(getComputedStyle(c).backgroundColor)];
        return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10;
      })(),
      emparejar: (() => {
        const el = document.querySelector(".emparejar");
        if (!el) return null;
        const hijos = [...el.children].filter((h) => h.getClientRects().length);
        return { arriba: Math.round(hijos[0].getBoundingClientRect().top), abajo: Math.round(hijos.at(-1).getBoundingClientRect().bottom) };
      })(),
      barraPortada: caja(".portada > .barra"),
    };
  });
  // Centrado en la vista (con lo que se come la barra de deslizar a la derecha).
  const centrado = (m, c) => !!c && !!m.vista && Math.abs((c.x - m.vista.x) - (m.vista.d - c.d)) <= 20;
  const columna = (m, c, tope = 880) => !!c && c.w <= tope && centrado(m, c);

  const entrar = async (W, tema, hash = "") => {
    await page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" });
    await page.setViewportSize({ width: W, height: ALTO[W] || 900 });
    await page.goto(`${B}/`);
    await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);
    await page.goto(`${B}/?v=${W}${tema}${hash}`);
    await page.waitForSelector(".vista");
    await espera(1100);
  };
  const ir = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await espera(1000); };

  // 1. En el PC.
  for (const [W, tema] of [[1366, "oscuro"], [1440, "claro"], [1920, "oscuro"], [1920, "claro"]]) {
    const p = `${W}-${tema}`;
    const r = (pasos[p] = {});
    await entrar(W, tema);
    const m = (r.inicio = await medir(page));
    await foto(`pc-${p}-inicio`);
    debe(m.cajonSeVe && !m.veloTapa && m.cajon.d <= m.vista.x + 1, `${p}: el cajón, fijo a la izquierda y sin tapar nada (${JSON.stringify({ cajon: m.cajon, vista: m.vista, velo: m.veloTapa })})`);
    debe(!m.botonCajon, `${p}: con el cajón fijo, su botón sobra`);
    debe(m.cajonSeVe && !m.encargoTapa, `${p}: «Nuevo encargo» no tapa los proyectos del cajón`);
    debe(m.contrasteCuenta !== null && m.contrasteCuenta >= 4.5, `${p}: la cifra de Decisiones del cajón se lee (contraste ${m.contrasteCuenta})`);
    debe(!m.barraPortada, `${p}: en el inicio no se repite «Adeorq» arriba, que ya está en el cajón`);
    debe(columna(m, m.grupo), `${p}: «Te esperan», en una columna centrada (${JSON.stringify(m.grupo)} en ${JSON.stringify(m.vista)})`);
    debe(columna(m, m.filaCaja, 890), `${p}: la caja de escribir, en la misma columna (${JSON.stringify(m.filaCaja)})`);
    debe(!m.seSale, `${p}: nada se sale de lado en el inicio`);
    // Con el ratón, una fila responde al pasar por encima.
    const fila = await page.$("#filas .fila");
    if (fila) {
      const fondo = () => fila.evaluate((f) => getComputedStyle(f).backgroundColor);
      await page.mouse.move(2, 2);
      const antes = await fondo();
      await fila.hover();
      await espera(250);
      r.hover = [antes, await fondo()];
      debe(r.hover[0] !== r.hover[1], `${p}: una conversación responde al pasar el ratón (${r.hover.join(" → ")})`);
      // Clic derecho (lo que en el móvil es mantenerla pulsada): una ventana en medio.
      await fila.click({ button: "right" });
      await espera(400);
      r.hoja = await page.evaluate(() => {
        const h = document.getElementById("hoja")?.getBoundingClientRect();
        const v = document.querySelector(".vista").getBoundingClientRect();
        return h && { w: Math.round(h.width), centro: Math.round(h.left + h.width / 2), centroVista: Math.round(v.left + v.width / 2) };
      });
      debe(!!r.hoja && r.hoja.w <= 440 && Math.abs(r.hoja.centro - r.hoja.centroVista) <= 4, `${p}: borrar una conversación sale en una ventana en medio, no a todo el ancho (${JSON.stringify(r.hoja)})`);
      await foto(`pc-${p}-hoja`);
      await page.click("#hoja-cancelar").catch(() => {});
    } else fallos.push(`${p}: no hay conversación en el inicio para mirarla`);

    await ir("#terminal=1@111");
    const t = (r.terminal = await medir(page));
    await foto(`pc-${p}-terminal`);
    debe(t.cajonSeVe && !t.veloTapa, `${p}: en una terminal el cajón sigue fijo`);
    debe(columna(t, t.avisoDec, 890), `${p}: el aviso de la decisión, en la columna (${JSON.stringify(t.avisoDec)})`);
    debe(columna(t, t.filaCaja, 890), `${p}: la caja de la terminal, en la columna (${JSON.stringify(t.filaCaja)})`);
    debe(!t.seSale, `${p}: nada se sale de lado en una terminal`);
    const pantalla = await page.$(".pestanas .pastilla[data-cara='pantalla']");
    if (pantalla) {
      await pantalla.click();
      await espera(900);
      const s = (r.pantalla = await medir(page));
      await foto(`pc-${p}-pantalla`);
      debe(!!s.pantalla && s.pantalla.w <= 1240 && centrado(s, s.pantalla), `${p}: la pantalla de la terminal, centrada y como mucho de 1240 (${JSON.stringify(s.pantalla)})`);
      debe(s.letraPantalla >= 13, `${p}: la pantalla con letra de PC (${s.letraPantalla} px)`);
    }

    await ir("#decision=d19a2b3c4d5");
    const d = (r.decision = await medir(page));
    await foto(`pc-${p}-decision`);
    debe(columna(d, d.pregunta), `${p}: una decisión, en la columna (${JSON.stringify(d.pregunta)})`);
    debe(!!d.enviarDec && d.enviarDec.w <= 860, `${p}: «Enviar respuesta» no cruza la pantalla (${JSON.stringify(d.enviarDec)})`);

    // Con el cajón fijo, directo; si no (la página de antes), se abre primero.
    if (!(await medir(page)).cajonSeVe) {
      for (let i = 0; i < 3 && !(await page.$("#abrir-cajon")); i++) { await page.click(".barra > button:first-child"); await espera(700); }
      await page.click("#abrir-cajon");
      await espera(450);
    }
    await page.click('#cajon [data-ir="ajustes"]');
    await espera(900);
    const a = (r.ajustes = await medir(page));
    await foto(`pc-${p}-ajustes`);
    debe(!!a.fotoMini && a.fotoMini.h <= 240, `${p}: las fotos de Ajustes, de miniatura (${JSON.stringify(a.fotoMini)})`);
    debe(a.fotos.length === 3 && a.fotos.every((f) => f.y === a.fotos[0].y && Math.abs(f.h - a.fotos[0].h) <= 1), `${p}: las tres fotos, a la misma altura y del mismo alto (${JSON.stringify(a.fotos)})`);
    debe(!!a.grupoFotos && a.fotos.length === 3 && a.grupoFotos.d - a.fotos[2].d <= 40, `${p}: las fotos llenan su fila, sin hueco a la derecha (${JSON.stringify({ fotos: a.fotos, grupo: a.grupoFotos })})`);
    debe(columna(a, a.grupo), `${p}: Ajustes, en la columna (${JSON.stringify(a.grupo)})`);
    debe(!a.seSale, `${p}: nada se sale de lado en Ajustes`);

    // Emparejar: sin cajón (no hay aparato) y en medio de la ventana.
    await page.evaluate(() => localStorage.removeItem("adeorq-movil-clave"));
    await page.goto(`${B}/?v=e${W}${tema}`);
    await page.waitForSelector("#codigo");
    await espera(400);
    const em = (r.emparejar = await medir(page));
    await foto(`pc-${p}-emparejar`);
    debe(!em.cajonSeVe, `${p}: emparejando no sale el cajón`);
    const hueco = em.emparejar && [em.emparejar.arriba, em.alto - em.emparejar.abajo];
    debe(!!hueco && Math.abs(hueco[0] - hueco[1]) <= em.alto * 0.12, `${p}: emparejar va en medio de la ventana, no arriba con el hueco debajo (arriba ${hueco?.[0]}, abajo ${hueco?.[1]})`);
  }

  // 2. Intro manda, Mayús+Intro baja de línea (con un teclado de PC).
  await entrar(1440, "oscuro");
  await page.fill("#decir", "hola desde el pc");
  await page.press("#decir", "Shift+Enter");
  pasos.mayusIntro = await page.$eval("#decir", (t) => t.value);
  debe(pasos.mayusIntro === "hola desde el pc\n", `Mayús+Intro baja de línea (${JSON.stringify(pasos.mayusIntro)})`);
  await page.press("#decir", "Enter");
  await espera(1200);
  pasos.intro = await page.evaluate(() => ({ inicio: !!document.getElementById("decir"), hilo: !!document.getElementById("hilo"), dijo: document.getElementById("hilo")?.textContent.includes("hola desde el pc") ?? false }));
  debe(!pasos.intro.inicio && pasos.intro.hilo && pasos.intro.dijo, `Intro manda el mensaje a Adeo (${JSON.stringify(pasos.intro)})`);

  // 3. Dentro de un marco ancho, como en su panel: su barra a la izquierda y su
  //    cabecera arriba. Del mismo origen, para que el marco vea la clave (en el
  //    panel de verdad se la pasa por postMessage).
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${B}/api/yo`);
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);
  await page.evaluate((src) => {
    document.open();
    document.write(`<body style="margin:0;display:grid;grid-template-columns:250px 1fr;height:100vh;background:#111"><nav></nav><main style="display:flex;flex-direction:column"><div style="height:110px;background:#222"></div><iframe src="${src}" style="flex:1;border:0;width:100%"></iframe></main></body>`);
    document.close();
  }, `${B}/?v=marco`);
  await espera(2200);
  const marco = page.frames().find((f) => f.url().includes("v=marco"));
  if (marco) {
    const mm = (pasos.marco = await medir(marco));
    await foto("pc-marco-1920-inicio");
    debe(mm.cajonSeVe && !mm.veloTapa, `en el marco del panel (${mm.ancho} px), el cajón fijo (${JSON.stringify(mm.cajon)})`);
    debe(columna(mm, mm.grupo), `en el marco del panel, la columna centrada (${JSON.stringify(mm.grupo)} en ${JSON.stringify(mm.vista)})`);
  } else fallos.push("no se cargó la página dentro del marco");

  // 4. En el móvil, como siempre.
  for (const W of [390, 360]) {
    await entrar(W, "oscuro");
    const m = (pasos[`movil-${W}`] = await medir(page));
    await foto(`movil-${W}-inicio`);
    debe(m.botonCajon && !m.cajonSeVe, `${W}: el cajón sale con su botón, cerrado de entrada`);
    debe(m.rellenoCuerpo === 16, `${W}: los márgenes de 16 px (${m.rellenoCuerpo})`);
    debe(!!m.filaCaja && m.filaCaja.w === W - 24, `${W}: la caja de escribir a todo el ancho menos 12 px por lado (${JSON.stringify(m.filaCaja)})`);
    debe(!m.seSale, `${W}: nada se sale de lado`);
    await page.click("#abrir-cajon");
    await espera(500);
    const c = await medir(page);
    debe(c.cajonSeVe && c.veloTapa, `${W}: el cajón abre encima con su velo`);
    debe(c.contrasteCuenta !== null && c.contrasteCuenta >= 4.5, `${W}: la cifra de Decisiones del cajón se lee (contraste ${c.contrasteCuenta})`);
    await foto(`movil-${W}-cajon`);
    await page.click('#cajon [data-ir="ajustes"]');
    await espera(900);
    const a = await medir(page);
    debe(!a.seSale && !a.cajonSeVe, `${W}: Ajustes cierra el cajón y no se sale de lado`);
    debe(a.fotos.length === 3 && a.fotos.every((f) => f.y === a.fotos[0].y && Math.abs(f.h - a.fotos[0].h) <= 1), `${W}: las tres fotos de Ajustes, a la misma altura y del mismo alto (${JSON.stringify(a.fotos)})`);
    await foto(`movil-${W}-ajustes`);
  }

  debe(!errores.length, `sin errores en la página (${errores.join(" | ")})`);
  return { pasos, fallos };
}
