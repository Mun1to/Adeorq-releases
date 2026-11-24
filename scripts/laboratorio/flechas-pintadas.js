// Las flechas del recorrido de la demo, medidas como se PINTAN en la portada
// construida: lo que `scripts/flechas-check.mjs` no puede ver sin un navegador.
//
//   1. Construir la web fuera del repo (desde web/: hacer-ingles, hacer-privacidad,
//      hacer-paginas, poner-metadatos y `vite build --outDir <carpeta>`) y
//      servirla en 127.0.0.1 (una carpeta da su index.html).
//   2. browser_navigate a la portada servida: http://[::ffff:127.0.0.1]:<puerto>/
//      (el perfil compartido guarda un zoom del 200 % para «127.0.0.1»; esa
//      dirección es la misma máquina con otro nombre, y el banco corrige el
//      zoom si aun así lo encuentra).
//   3. browser_run_code_unsafe(filename = "scripts/laboratorio/flechas-pintadas.js")
//      (el MCP solo lee archivos de C:\proyectos\Adeorq: desde un worktree,
//      se le pasa el texto de la función en `code`).
//
// El 22-nov, sobre main (ae0a12a9), salió en rojo solo la vuelta con
// movimiento: `explica.js` pinta la flecha con el bocadillo todavía corrido
// por su animación de entrada (`aparecer`, 12 px), y las seis salían a 22 px
// del bocadillo (una a 78) en vez de a 10. Sin movimiento, las 26 flechas bien.
//
// Abre su propia pestaña (y la cierra; el navegador es de todas las sesiones,
// nunca se cierra entero), y a 1440, 768 y 390 px de ancho, en español y en
// inglés, borra el «ya visto» del recorrido, baja hasta la demo, espera al
// recorrido y pasa sus paradas una a una. En cada una mide, en píxeles de
// pantalla y con lo que el navegador calcula (el CSS incluido):
//   · las piezas del lienzo: dos caminos de halo y dos de trazo, o ninguno;
//   · el grosor: `stroke-width` calculado del trazo (5 a 7 px) y del halo (de
//     4 a 8 px más), con su color sin transparentar y nada escondido;
//   · el largo del tallo con `getTotalLength` (80 px como poco);
//   · la forma: el tallo es UNA curva cúbica con sus dos controles del mismo
//     lado (una sola comba) y la punta son DOS patas que salen de su final;
//   · el hueco de la punta a lo señalado (14 a 30 px; lo señalado es el aro
//     menos sus 7 px) y que el tallo no cruce el bocadillo, a Adeo ni lo
//     señalado;
//   · y además lo pasa por el `revisarFlecha` de la propia página.
// Una vuelta más a 1440 en español con el movimiento encendido, por si la
// animación del trazo dejara algo a medias.
//
// Devuelve { resumen, fallos, paradas }: `fallos` vacío es que todas las
// flechas pintadas están bien. Las medidas mínimas son las de
// GUSTOS-DE-DISENO.md (la flecha dibujada a mano), las mismas de LISTON en
// scripts/flechas-check.mjs, que comprueba que coinciden.
async (page) => {
  const LISTON = { ancho: [5, 7], haloMas: [4, 8], largoMin: 80, hueco: [14, 30], aro: 7 };
  const origen = new URL(page.url()).origin;
  if (!/^http:\/\/(127\.0\.0\.1|\[::ffff:7f00:1\]|\[::ffff:127\.0\.0\.1\])(:\d+)?$/.test(origen)) {
    return { fallos: [`abre antes la portada construida en 127.0.0.1 (la página está en ${page.url()})`] };
  }
  const fallos = [];
  const paradas = [];
  const tab = await page.context().newPage();
  try {
    const vueltas = [];
    for (const lang of ["es", "en"]) for (const [w, h] of [[1440, 900], [768, 1024], [390, 844]]) vueltas.push({ lang, w, h, motion: "off" });
    vueltas.push({ lang: "es", w: 1440, h: 900, motion: "full" });

    for (const v of vueltas) {
      const nombre = `${v.lang} a ${v.w} px${v.motion === "full" ? " con movimiento" : ""}`;
      await tab.setViewportSize({ width: v.w, height: v.h });
      const url = `${origen}${v.lang === "en" ? "/en/" : "/"}?motion=${v.motion}`;
      await tab.goto(url, { waitUntil: "load" });
      // El zoom por sitio del perfil: que la página mida lo que se pide.
      const ancho = await tab.evaluate(() => innerWidth);
      if (Math.abs(ancho - v.w) > 1) {
        const z = v.w / ancho;
        await tab.setViewportSize({ width: Math.round(v.w * z), height: Math.round(v.h * z) });
      }
      await tab.evaluate(() => { try { localStorage.removeItem("adeorq.demo.recorrido"); } catch {} });
      await tab.goto(url, { waitUntil: "load" });
      const medido = await tab.evaluate(() => innerWidth);
      if (Math.abs(medido - v.w) > 1) { fallos.push(`${nombre}: la página mide ${medido} px de ancho y no ${v.w}`); continue; }
      await tab.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; document.getElementById("ventana-demo")?.scrollIntoView({ block: "center" }); });
      const marco = await tab.waitForSelector("#ventana-demo", { timeout: 10000 }).catch(() => null);
      let f = null;
      for (let i = 0; i < 50 && !f?.url().includes("/demo/"); i++) { await tab.waitForTimeout(200); f = await marco?.contentFrame(); }
      if (!f) { fallos.push(`${nombre}: la demo no carga`); continue; }
      const dice = await f.waitForSelector('.adeo-dice[role="dialog"]', { timeout: 20000 }).catch(() => null);
      if (!dice) { paradas.push({ vuelta: nombre, recorrido: false }); fallos.push(`${nombre}: no sale el recorrido`); continue; }
      const escalaMarco = await tab.evaluate(() => { const m = document.getElementById("ventana-demo"); return m.getBoundingClientRect().width / (m.clientWidth || m.getBoundingClientRect().width); });

      let antes = null;
      for (let n = 0; n < 30; n++) {
        await tab.waitForTimeout(v.motion === "full" ? 1400 : 450);
        const m = await f.evaluate(async ({ L, E1 }) => {
          const dice = document.querySelector('.adeo-dice[role="dialog"]');
          if (!dice) return null;
          const svg = document.querySelector("svg.adeo-flecha");
          const foco = document.querySelector(".adeo-foco");
          const out = { cuenta: dice.querySelector(".adeo-cuenta")?.textContent ?? "", titulo: dice.querySelector(".adeo-titulo")?.textContent ?? "", mal: [] };
          if (!svg) { out.mal.push("no hay <svg class=\"adeo-flecha\">"); return out; }
          const sr = svg.getBoundingClientRect();
          const E0 = sr.width / 1920;           // px del marco por unidad del dibujo
          const E = E0 * E1;                     // px de pantalla por unidad del dibujo
          const hijos = [...svg.children];
          out.flecha = hijos.length > 0;
          if (!hijos.length) return out;
          const clase = (h) => h.getAttribute("class");
          const halo = hijos.filter((h) => h.localName === "path" && clase(h) === "adeo-flecha-halo");
          const trazo = hijos.filter((h) => h.localName === "path" && clase(h) === "adeo-flecha-trazo");
          if (hijos.length !== 4 || halo.length !== 2 || trazo.length !== 2) {
            out.mal.push(`el lienzo lleva ${hijos.length} piezas (${hijos.map((h) => `${h.localName}.${clase(h)}`).join(", ")}): una flecha son dos caminos de halo y dos de trazo`);
            return out;
          }
          // Lo que calcula el navegador, con el CSS dentro.
          const cs = (el) => getComputedStyle(el);
          const alfa = (c) => {
            const m = String(c).match(/rgba?\(([^)]*)\)|color\([^)]*\)/);
            if (!m) return /transparent|none/.test(c) ? 0 : 1;
            const s = m[0];
            const barra = s.match(/\/\s*([\d.]+%?)/);
            if (barra) return barra[1].endsWith("%") ? parseFloat(barra[1]) / 100 : parseFloat(barra[1]);
            const partes = (m[1] ?? "").split(/[\s,]+/).filter(Boolean);
            return partes.length === 4 ? parseFloat(partes[3]) : 1;
          };
          for (const el of [...hijos, svg, svg.parentElement]) {
            const c = cs(el);
            if (parseFloat(c.opacity) < 0.999) out.mal.push(`${el.localName}.${clase(el)} con opacidad ${c.opacity}`);
            if (c.visibility !== "visible" || c.display === "none") out.mal.push(`${el.localName}.${clase(el)} escondido (${c.display}, ${c.visibility})`);
          }
          const w = (el) => parseFloat(cs(el).strokeWidth) * E;
          const wt = trazo.map(w), wh = halo.map(w);
          out.trazo = +wt[0].toFixed(2);
          out.halo = +wh[0].toFixed(2);
          if (Math.abs(wt[0] - wt[1]) > 0.05 || Math.abs(wh[0] - wh[1]) > 0.05) out.mal.push("el tallo y la punta se pintan con grosores distintos");
          if (wt[0] < L.ancho[0] - 0.05 || wt[0] > L.ancho[1] + 0.05) out.mal.push(`trazo de ${out.trazo} px en pantalla (de ${L.ancho.join(" a ")})`);
          if (wh[0] - wt[0] < L.haloMas[0] - 0.05 || wh[0] - wt[0] > L.haloMas[1] + 0.05) out.mal.push(`halo de ${out.halo} px, ${(wh[0] - wt[0]).toFixed(2)} más que el trazo (de ${L.haloMas.join(" a ")})`);
          for (const el of [...trazo, ...halo]) if (alfa(cs(el).stroke) < 0.5) out.mal.push(`${clase(el)} casi transparente (${cs(el).stroke})`);
          for (const el of hijos) if (!/^none/.test(cs(el).fill)) out.mal.push(`${clase(el)} relleno (${cs(el).fill})`);
          // La forma, leída del `d` que se pinta.
          const tallo = trazo.find((h) => /C/.test(h.getAttribute("d")));
          const punta = trazo.find((h) => h !== tallo);
          const NUM = "(-?\\d*\\.?\\d+(?:e-?\\d+)?)", S = "[\\s,]*", P = NUM + S + NUM;
          const mt = tallo?.getAttribute("d").match(new RegExp(`^\\s*M${S}${P}${S}C${S}${P}${S}${P}${S}${P}\\s*$`));
          const mp = punta?.getAttribute("d").match(new RegExp(`^\\s*M${S}${P}${S}L${S}${P}${S}L${S}${P}\\s*$`));
          if (!mt) { out.mal.push(`el tallo no es una sola curva cúbica: «${tallo?.getAttribute("d")?.slice(0, 60)}»`); return out; }
          if (!mp) { out.mal.push(`la punta no son dos patas: «${punta?.getAttribute("d")?.slice(0, 60)}»`); return out; }
          const n = (m) => m.slice(1).map(Number);
          const [x0, y0, x1, y1, x2, y2, x3, y3] = n(mt);
          const [pa, pb, vx, vy, pc, pd] = n(mp);
          const lado = (x, y) => Math.sign((x3 - x0) * (y - y0) - (y3 - y0) * (x - x0));
          if (lado(x1, y1) !== lado(x2, y2) || !lado(x1, y1)) out.mal.push("el tallo no tiene una sola comba (S, o recta)");
          if (Math.hypot(vx - x3, vy - y3) * E > 0.3) out.mal.push(`la punta no sale del final del tallo: a ${(Math.hypot(vx - x3, vy - y3) * E).toFixed(1)} px`);
          const largo = tallo.getTotalLength() * E;
          out.largo = Math.round(largo);
          if (largo < L.largoMin) out.mal.push(`el tallo mide ${out.largo} px en pantalla (${L.largoMin} como poco)`);
          // Las cajas, en unidades del dibujo.
          const enDibujo = (r) => ({ left: (r.left - sr.left) / E0, top: (r.top - sr.top) / E0, right: (r.right - sr.left) / E0, bottom: (r.bottom - sr.top) / E0 });
          const px = 1 / E;
          const boc = dice.querySelector(".adeo-bocadillo"), cara = dice.querySelector(".adeo-cara");
          const desde = enDibujo(boc.getBoundingClientRect());
          const suCara = cara && cara.getBoundingClientRect().width ? enDibujo(cara.getBoundingClientRect()) : null;
          const aro = { left: parseFloat(foco.style.left), top: parseFloat(foco.style.top), right: parseFloat(foco.style.left) + parseFloat(foco.style.width), bottom: parseFloat(foco.style.top) + parseFloat(foco.style.height) };
          const d = L.aro * px;
          const hasta = { left: aro.left + d, top: aro.top + d, right: aro.right - d, bottom: aro.bottom - d };
          const aCaja = (x, y, r) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
          const dentro = (x, y, r, m) => x > r.left - m && x < r.right + m && y > r.top - m && y < r.bottom + m;
          out.hueco = +(aCaja(vx, vy, hasta) / px).toFixed(1);
          if (out.hueco < L.hueco[0] - 0.5 || out.hueco > L.hueco[1] + 0.5) out.mal.push(`la punta queda a ${out.hueco} px de lo señalado (de ${L.hueco.join(" a ")})`);
          const juntos = suCara ? { left: Math.min(desde.left, suCara.left), top: Math.min(desde.top, suCara.top), right: Math.max(desde.right, suCara.right), bottom: Math.max(desde.bottom, suCara.bottom) } : desde;
          let cruza = "";
          const T = tallo.getTotalLength();
          for (let i = 2; i < 39 && !cruza; i++) {
            const p = tallo.getPointAtLength((T * i) / 40);
            if (dentro(p.x, p.y, desde, 2 * px)) cruza = "el bocadillo";
            else if (suCara && dentro(p.x, p.y, suCara, 2 * px)) cruza = "a Adeo";
            else if (dentro(p.x, p.y, hasta, 10 * px)) cruza = "lo señalado";
          }
          if (cruza) out.mal.push(`el tallo cruza por encima de ${cruza}`);
          // Y el revisor de la propia página, del bocadillo o del bocadillo con Adeo.
          const { revisarFlecha } = await import("/demo/flecha.js");
          const g = { tallo: tallo.getAttribute("d"), punta: punta.getAttribute("d"), ancho: parseFloat(cs(trazo[0]).strokeWidth), halo: parseFloat(cs(halo[0]).strokeWidth) };
          const solo = revisarFlecha(g, { desde, hasta, px, evitar: suCara ? [suCara] : [] });
          const conAdeo = suCara ? revisarFlecha(g, { desde: juntos, hasta, px }) : solo;
          if (solo.length && conAdeo.length) out.mal.push(...solo.map((m) => `revisarFlecha: ${m}`));
          return out;
        }, { L: LISTON, E1: escalaMarco });
        if (!m) break;
        if (antes && m.cuenta === antes) {
          // No avanzó: un clic más, y si tampoco, se acaba la vuelta.
          const otra = await f.evaluate(() => { document.querySelector('.adeo-dice[role="dialog"] .adeo-btn--prim')?.click(); return true; });
          await tab.waitForTimeout(600);
          const ahora = await f.evaluate(() => document.querySelector('.adeo-dice[role="dialog"] .adeo-cuenta')?.textContent ?? null);
          if (!otra || ahora === antes) { fallos.push(`${nombre}: el recorrido no pasa de «${antes}»`); break; }
          continue;
        }
        antes = m.cuenta;
        paradas.push({ vuelta: nombre, ...m });
        for (const x of m.mal) fallos.push(`${nombre}, parada ${m.cuenta} («${m.titulo}»): ${x}`);
        const [i, total] = (m.cuenta.match(/\d+/g) ?? []).map(Number);
        const sigue = await f.evaluate(() => { const b = document.querySelector('.adeo-dice[role="dialog"] .adeo-btn--prim'); b?.click(); return !!b; });
        if (!sigue || (i && total && i >= total)) break;
      }
    }
  } finally {
    await tab.close();
  }
  const conFlecha = paradas.filter((p) => p.flecha);
  for (const lang of ["es", "en"]) {
    if (!conFlecha.some((p) => p.vuelta.startsWith(`${lang} a 1440`))) fallos.push(`${lang} a 1440 px: ninguna parada con flecha, el banco no mide nada`);
  }
  const rango = (k) => { const xs = conFlecha.map((p) => p[k]).filter(Number.isFinite); return xs.length ? `${Math.min(...xs)}-${Math.max(...xs)}` : "-"; };
  const porVuelta = [...new Set(paradas.map((p) => p.vuelta))].map((vu) => {
    const ps = paradas.filter((p) => p.vuelta === vu);
    return `${vu}: ${ps.filter((p) => p.flecha).length} flechas en ${ps.length} paradas`;
  });
  return {
    resumen: `${conFlecha.length} flechas pintadas en ${paradas.length} paradas; trazo ${rango("trazo")} px, halo ${rango("halo")} px, tallo ${rango("largo")} px, hueco ${rango("hueco")} px`,
    porVuelta,
    fallos,
    paradas: paradas.map((p) => `${p.vuelta} · ${p.cuenta} · ${p.flecha ? `trazo ${p.trazo} halo ${p.halo} largo ${p.largo} hueco ${p.hueco}` : p.recorrido === false ? "sin recorrido" : "sin flecha"}${p.mal?.length ? " · MAL" : ""}`),
  };
}
