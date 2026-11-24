// Las flechas dibujadas a mano de la web, medidas regla por regla.
//
// Munir, 2026-11-22, de las del recorrido de la demo: «que las flechas del tour
// de la web arreglarlas y que no vuelva a pasar nunca lo de las flechas mal
// hechas ya me paso una vez» (la otra, la de los disquetes de winshotx, 14-nov).
// Las reglas viven en `web/demo/flecha.js` (`revisarFlecha`, que mide los
// caminos que se pintan); aquí se comprueba:
//   1. el listón: las medidas de `flecha.js` (`MEDIDAS`) no bajan de las que
//      Munir dio por buenas (`C:\proyectos\_docs\GUSTOS-DE-DISENO.md`, la flecha
//      dibujada a mano). Están escritas aquí otra vez A PROPÓSITO: si se aflojan
//      en `flecha.js`, este archivo no se afloja con ellas;
//   2. que la flecha que traza `flecha.js` pasa sus reglas en miles de
//      colocaciones del bocadillo, de Adeo y de lo que señala, a las escalas de
//      la demo, y que `flechaBuena` (lo que se pinta) nunca da una que su
//      revisión rechace, con la cara de Adeo en medio;
//   3. que el revisor caza las flechas malas, cada una por SU regla: las de
//      antes (la S corta, la punta girada, la que pisa el aro…) y las que se
//      le escaparon a la revisión del 22-nov (pintada recta, con los controles
//      cambiados, con una tercera pata, gorda como una salchicha, con un halo
//      enorme o casi pegado);
//   4. que ninguna hoja de estilo de la web cambia lo que se pinta: un
//      `stroke-width` en CSS pisa el atributo que decidió `flecha.js`
//      (`.adeo-flecha path { stroke-width: 2px }` la dejaba en 1,5 px);
//   5. lo que pinta `web/demo/explica.js` de verdad: se monta en jsdom con
//      cajas de mentira, se le hace dar el recorrido en cientos de sitios y se
//      miden los caminos y los anchos que deja en el SVG, contra lo señalado
//      de verdad (pintar el halo con el ancho del trazo, `px = 1`, olvidar a
//      Adeo en `evitar` o apuntar a una caja inflada pasaban);
//   6. que en la web nadie dibuja una flecha por su cuenta, en un `.js`, un
//      `.mjs` o un `.html`, con `<path>`, `<polyline>`, `<polygon>`, `<line>`
//      o en un canvas, aunque la clase llegue por parámetro o el nombre diez
//      líneas más abajo, y sin confundir con una flecha los iconos (`i-flecha`,
//      `pregunta__flecha`, `comparar__flecha`, `comando__flecha`). Las dos
//      excepciones van abajo, en `EXCEPCIONES`, con su porqué.
//
// Lo que no se puede medir sin pintar (el `stroke-width` calculado, lo que mide
// el trazo en pantalla con `getTotalLength`, el hueco de la punta en la página
// construida, la flecha con el movimiento encendido) lo mide el banco del
// navegador: `scripts/laboratorio/flechas-pintadas.js` (su cabecera dice cómo
// se lanza), con el mismo listón que este archivo, que lo comprueba.
//
//   node scripts/flechas-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FLECHA = path.join(RAIZ, "web/demo/flecha.js");
const { trazarFlecha, revisarFlecha, flechaBuena, MEDIDAS } = await import(pathToFileURL(FLECHA).href);

const fallos = [];
const resumen = [];
const caja =(left, top, w, h) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });
const juntar = (a, b) => caja(Math.min(a.left, b.left), Math.min(a.top, b.top), Math.max(a.right, b.right) - Math.min(a.left, b.left), Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top));
const f1 = (p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

/** Una dependencia de `node_modules`: la de este repo, o la de la carpeta desde
 *  la que se lanza (una copia del comprobador en otra carpeta la busca ahí). */
async function cargar(nombre) {
  try {
    return await import(nombre);
  } catch {
    const req = createRequire(path.join(process.cwd(), "noop.js"));
    return await import(pathToFileURL(req.resolve(nombre)).href);
  }
}

/** Los archivos de web/ con esas extensiones, fuera de node_modules y dist. */
function archivosDeLaWeb(extension) {
  const out = [];
  const pasear = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist"].includes(e.name) || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) pasear(p);
      else if (extension.test(e.name)) out.push({ ruta: p, rel: path.relative(RAIZ, p).split(path.sep).join("/") });
    }
  };
  pasear(path.join(RAIZ, "web"));
  return out;
}

/** Los tramos de un camino SVG: `{ a, b, curva, ctrl, arco, sub }`. */
function tramos(d) {
  const t = String(d).match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out = [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, sub = -1, lc = null;
  const esLetra = (s) => /^[a-zA-Z]$/.test(s);
  const n = () => parseFloat(t[i++]);
  while (i < t.length) {
    const antes = i;
    if (esLetra(t[i])) cmd = t[i++];
    if (!cmd) break;
    const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    const a = { x, y };
    if (C === "Z") {
      out.push({ a, b: { x: sx, y: sy }, curva: false, sub });
      x = sx; y = sy; lc = null;
      if (i < t.length && !esLetra(t[i])) break;
      continue;
    }
    const pide = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[C];
    if (!pide || i + pide > t.length || t.slice(i, i + pide).some(esLetra)) break;
    if (C === "M") { x = ox + n(); y = oy + n(); sx = x; sy = y; sub++; cmd = rel ? "l" : "L"; lc = null; }
    else if (C === "L") { x = ox + n(); y = oy + n(); out.push({ a, b: { x, y }, curva: false, sub }); lc = null; }
    else if (C === "H") { x = (rel ? x : 0) + n(); out.push({ a, b: { x, y }, curva: false, sub }); lc = null; }
    else if (C === "V") { y = (rel ? y : 0) + n(); out.push({ a, b: { x, y }, curva: false, sub }); lc = null; }
    else if (C === "C") { const c1 = { x: ox + n(), y: oy + n() }, c2 = { x: ox + n(), y: oy + n() }; x = ox + n(); y = oy + n(); out.push({ a, b: { x, y }, curva: true, ctrl: [c1, c2], sub }); lc = c2; }
    else if (C === "S") { const c1 = lc ? { x: 2 * a.x - lc.x, y: 2 * a.y - lc.y } : a; const c2 = { x: ox + n(), y: oy + n() }; x = ox + n(); y = oy + n(); out.push({ a, b: { x, y }, curva: true, ctrl: [c1, c2], sub }); lc = c2; }
    else if (C === "Q") { const c = { x: ox + n(), y: oy + n() }; x = ox + n(); y = oy + n(); out.push({ a, b: { x, y }, curva: true, ctrl: [c], sub }); lc = c; }
    else if (C === "T") { const c = lc ? { x: 2 * a.x - lc.x, y: 2 * a.y - lc.y } : a; x = ox + n(); y = oy + n(); out.push({ a, b: { x, y }, curva: true, ctrl: [c], sub }); lc = c; }
    else if (C === "A") { const rx = Math.abs(n()), ry = Math.abs(n()); n(); const grande = n(); n(); x = ox + n(); y = oy + n(); out.push({ a, b: { x, y }, curva: true, arco: { r: Math.max(rx, ry), grande: !!grande }, sub }); lc = null; }
    if (i === antes) break;
  }
  return out.filter((s) => [s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite));
}

// ── 1. El listón ─────────────────────────────────────────────────────────
// En píxeles de pantalla. De GUSTOS-DE-DISENO.md («una flecha dibujada a mano
// bien hecha») y de lo medido el 22-nov: trazo de rotulador (5 px, y más de 7
// ya es una salchicha), halo de 4 a 8 px más ancho que el trazo, 80 px de
// trazo, patas de 12 a 20 px abiertas entre 20° y 43°, la punta a 14-30 px de
// lo señalado, y una comba que no pasa de un cuarto de su recta.
const LISTON = {
  ancho: [5, 7],
  haloMas: [4, 8],
  largoMin: 80,
  pata: [12, 20],
  abre: [0.35, 0.75],
  hueco: [14, 30],
  sale: [6, 14],
  combaMax: 0.25,
};
{
  const M = MEDIDAS;
  const dentro = (v, [a, b]) => Number.isFinite(v) && v >= a && v <= b;
  const mal = [];
  if (!dentro(M.ancho, LISTON.ancho)) mal.push(`ancho ${M.ancho} (de ${LISTON.ancho.join(" a ")})`);
  if (!(M.anchoMax >= M.ancho && M.anchoMax <= LISTON.ancho[1])) mal.push(`anchoMax ${M.anchoMax} (de ${M.ancho} a ${LISTON.ancho[1]})`);
  if (!dentro(M.halo - M.ancho, LISTON.haloMas)) mal.push(`halo ${M.halo}: pasa al trazo en ${M.halo - M.ancho} (de ${LISTON.haloMas.join(" a ")})`);
  if (!(M.haloMas >= LISTON.haloMas[0] && M.haloMas <= M.halo - M.ancho)) mal.push(`haloMas ${M.haloMas} (${LISTON.haloMas[0]} como poco)`);
  if (!(M.haloMasMax <= LISTON.haloMas[1] && M.haloMasMax >= M.halo - M.ancho)) mal.push(`haloMasMax ${M.haloMasMax} (${LISTON.haloMas[1]} como mucho)`);
  if (!(M.largoMin >= LISTON.largoMin)) mal.push(`largoMin ${M.largoMin} (${LISTON.largoMin} como poco)`);
  if (!dentro(M.pata, LISTON.pata)) mal.push(`pata ${M.pata} (de ${LISTON.pata.join(" a ")})`);
  if (!dentro(M.abre, LISTON.abre)) mal.push(`abre ${M.abre} (de ${LISTON.abre.join(" a ")} radianes)`);
  if (!(M.huecoMin >= LISTON.hueco[0] && M.huecoMax <= LISTON.hueco[1] && M.hueco >= M.huecoMin && M.hueco <= M.huecoMax)) mal.push(`hueco ${M.hueco} entre ${M.huecoMin} y ${M.huecoMax} (de ${LISTON.hueco.join(" a ")})`);
  if (!dentro(M.sale, LISTON.sale)) mal.push(`sale ${M.sale} (de ${LISTON.sale.join(" a ")})`);
  if (!(M.combaMax <= LISTON.combaMax && M.comba > 0 && M.comba < M.combaMax)) mal.push(`comba ${M.comba} y combaMax ${M.combaMax} (${LISTON.combaMax} como mucho)`);
  if (mal.length) fallos.push(`las medidas de flecha.js se salen del listón: ${mal.join("; ")}`);
}
// El banco del navegador mide con el mismo listón: si uno se afloja, el otro lo dice.
{
  const BANCO = path.join(RAIZ, "scripts/laboratorio/flechas-pintadas.js");
  if (fs.existsSync(BANCO)) {
    const m = fs.readFileSync(BANCO, "utf8").match(/const LISTON = (\{[^;]*\});/);
    let suyo = null;
    try { suyo = m && Function(`return (${m[1]})`)(); } catch { /* se dice abajo */ }
    const igual = suyo && ["ancho", "haloMas", "largoMin", "hueco"].every((k) => JSON.stringify(suyo[k]) === JSON.stringify(LISTON[k])) && suyo.aro === 7;
    if (!igual) fallos.push(`scripts/laboratorio/flechas-pintadas.js no mide con el listón de aquí (${m ? m[1] : "sin LISTON"}): tienen que ser los mismos números`);
  }
}

// Un azar con semilla, para que un fallo se repita igual.
let semilla = 20261122;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);

// ── 2. Lo que traza pasa siempre, y lo que se pinta también ──────────────
// px: lo que mide un píxel de pantalla en la ventana de 1920 de la demo, con la
// demo a 1400, 1120 y 1000 px de ancho en la portada. Adeo va a la izquierda
// del bocadillo, apoyado abajo (demo.css), y la flecha no puede cruzarlo: en
// estas colocaciones `trazarFlecha` da cientos que lo cruzan, y `flechaBuena`
// tiene que no darlas nunca. Si un día no diera ninguna que lo cruce, la prueba
// de que `flechaBuena` revisa no mordería, y eso también es un fallo.
let trazadas = 0, conSitio = 0, sinFlechaConSitio = 0, buenas = 0, rechazables = 0;
const malasDeFlechaBuena = [];
for (const px of [1920 / 1400, 1920 / 1120, 1920 / 1000]) {
  for (let i = 0; i < 4000; i++) {
    const hasta = caja(40 + azar() * 1500, 40 + azar() * 800, 30 + azar() * 600, 20 + azar() * 500);
    const w = 300 * px, h = 120 * px;
    const desde = caja(azar() * (1920 - w), azar() * (1080 - h), w, h);
    const cara = caja(desde.left - 56 * px, desde.bottom - 60 * px, 50 * px, 60 * px);
    const comba = azar() < 0.5 ? 1 : -1;
    let cruzaAdeo = false;
    for (const c of [comba, -comba]) {
      const g = trazarFlecha({ desde, hasta, px, comba: c });
      if (!g) continue;
      trazadas++;
      // La forma, la punta, el largo y el hueco: lo que no depende de dónde esté Adeo.
      const mal = revisarFlecha(g, { desde, hasta, px }).filter((m) => !/pasa por encima/.test(m));
      if (mal.length && fallos.length < 8) fallos.push(`px=${px.toFixed(2)} desde ${JSON.stringify(desde)} hasta ${JSON.stringify(hasta)}: ${mal.join("; ")}`);
      if (revisarFlecha(g, { desde, hasta, px, evitar: [cara] }).length) cruzaAdeo = true;
    }
    if (cruzaAdeo) rechazables++;
    const pinta = flechaBuena({ desde, hasta, px, comba, evitar: [cara] });
    if (pinta) {
      buenas++;
      const mal = revisarFlecha(pinta, { desde, hasta, px, evitar: [cara] });
      if (mal.length) malasDeFlechaBuena.push(mal[0]);
    }
    // Con el bocadillo a 116 px de lo señalado, como lo pone el recorrido, y en
    // línea con él, tiene que salir flecha.
    const lado = Math.floor(azar() * 4);
    const hueco = 116 * px + 7 * px;
    const cx = (hasta.left + hasta.right) / 2 - w / 2, cy = (hasta.top + hasta.bottom) / 2 - h / 2;
    const pegado = [
      caja(cx, hasta.bottom + hueco, w, h),
      caja(cx, hasta.top - hueco - h, w, h),
      caja(hasta.right + hueco, cy, w, h),
      caja(hasta.left - hueco - w, cy, w, h),
    ][lado];
    conSitio++;
    if (!flechaBuena({ desde: pegado, hasta, px, comba })) sinFlechaConSitio++;
  }
}
if (trazadas < 5000) fallos.push(`solo se trazaron ${trazadas} flechas en 12.000 colocaciones: el trazador se rinde de más`);
if (sinFlechaConSitio > 0) fallos.push(`${sinFlechaConSitio} de ${conSitio} colocaciones como las del recorrido se quedan sin flecha`);
if (malasDeFlechaBuena.length) fallos.push(`flechaBuena da ${malasDeFlechaBuena.length} flechas que su propia revisión rechaza (la primera: ${malasDeFlechaBuena[0]}): lo que se pinta tiene que pasar revisarFlecha`);
if (rechazables < 50) fallos.push(`solo ${rechazables} colocaciones con una flecha trazada que cruza a Adeo: la prueba de que flechaBuena revisa no muerde`);
if (buenas < 3000) fallos.push(`flechaBuena solo dio ${buenas} flechas en 12.000 colocaciones con Adeo: se rinde de más`);
resumen.push(`${trazadas} flechas trazadas pasan sus reglas, y flechaBuena da ${buenas} con Adeo al lado y ninguna de las ${rechazables} colocaciones donde lo cruzaría`);

// ── 3. El revisor caza las malas, cada una por su regla ──────────────────
{
  const px = 1920 / 1400;
  const desde = caja(1000, 300, 300 * px, 120 * px);
  const hasta = caja(300, 280, 400, 300);
  const buena = trazarFlecha({ desde, hasta, px, comba: 1 });
  if (!buena) fallos.push("no sale flecha en una colocación de manual (bocadillo a la derecha, a 200 px)");
  else {
    const limpia = revisarFlecha(buena, { desde, hasta, px });
    if (limpia.length) fallos.push(`la flecha de manual no pasa: ${limpia.join("; ")}`);
    const rehacer = (g) => ({ ...g, tallo: `M${f1(g.ini)} C${f1(g.c1)} ${f1(g.c2)} ${f1(g.fin)}`, punta: `M${f1(g.patas[0])} L${f1(g.fin)} L${f1(g.patas[1])}` });
    const d = { x: buena.fin.x - buena.ini.x, y: buena.fin.y - buena.ini.y };
    const L = Math.hypot(d.x, d.y);
    const ladoC1 = Math.sign(d.x * (buena.c1.y - buena.ini.y) - d.y * (buena.c1.x - buena.ini.x)) || 1;
    const atras = Math.atan2(buena.c2.y - buena.fin.y, buena.c2.x - buena.fin.x);
    // [nombre, la regla que la tiene que cazar, cómo se rompe]
    const MALAS = [
      ["en S", /forma de S/, () => rehacer({ ...buena, c2: { x: buena.ini.x + d.x * 0.74 + d.y * 0.1, y: buena.ini.y + d.y * 0.74 - d.x * 0.1 } })],
      ["con la punta girada 20°", /patas|punta/, () => {
        const gira = (p, a) => ({ x: buena.fin.x + (p.x - buena.fin.x) * Math.cos(a) - (p.y - buena.fin.y) * Math.sin(a), y: buena.fin.y + (p.x - buena.fin.x) * Math.sin(a) + (p.y - buena.fin.y) * Math.cos(a) });
        return rehacer({ ...buena, patas: buena.patas.map((p) => gira(p, 0.35)) });
      }],
      ["con la punta separada del trazo", /final exacto/, () => ({ ...buena, punta: `M${f1({ x: buena.patas[0].x + 9, y: buena.patas[0].y })} L${f1({ x: buena.fin.x + 9, y: buena.fin.y })} L${f1({ x: buena.patas[1].x + 9, y: buena.patas[1].y })}` })],
      ["fina", /tiene que ser de/, () => ({ ...buena, ancho: 2 * px, halo: 8 * px })],
      ["corta, un gancho", /menos de|gancho/, () => rehacer({ ...buena, ini: { x: buena.fin.x + 40 * px, y: buena.fin.y }, c1: { x: buena.fin.x + 30 * px, y: buena.fin.y - 8 * px }, c2: { x: buena.fin.x + 12 * px, y: buena.fin.y - 6 * px } })],
      ["en arco", /arco/, () => rehacer({ ...buena, c1: { x: buena.c1.x - (d.y / L) * ladoC1 * 0.6 * L, y: buena.c1.y + (d.x / L) * ladoC1 * 0.6 * L } })],
      ["sin halo", /halo/, () => ({ ...buena, halo: 0 })],
      ["con el halo del ancho del trazo", /halo/, () => ({ ...buena, halo: buena.ancho })],
      // Las que se le escaparon a la revisión del 22-nov: el objeto decía una
      // cosa y el `d` pintaba otra, o las medidas no tenían techo.
      ["pintada recta (el tallo es M…L…)", /una sola curva/, () => ({ ...buena, tallo: `M${f1(buena.ini)} L${f1(buena.fin)}` })],
      ["con dos curvas en el tallo", /una sola curva/, () => ({ ...buena, tallo: `${buena.tallo} C${f1(buena.c2)} ${f1(buena.c1)} ${f1(buena.ini)}` })],
      // El objeto dice la flecha buena y el `d` pinta una S: manda el `d`.
      ["que se pinta en S con los puntos de la buena", /forma de S/, () => ({ ...buena, tallo: rehacer({ ...buena, c2: { x: buena.ini.x + d.x * 0.74 + d.y * 0.1, y: buena.ini.y + d.y * 0.74 - d.x * 0.1 } }).tallo })],
      ["con una tercera pata que se mete en lo señalado", /dos patas/, () => ({ ...buena, punta: `${buena.punta} M${f1(buena.fin)} L${f1({ x: buena.fin.x - Math.cos(atras) * 30 * px, y: buena.fin.y - Math.sin(atras) * 30 * px })}` })],
      ["gorda como una salchicha (24 px y halo de 30)", /no pasa de/, () => ({ ...buena, ancho: 24 * px, halo: 30 * px })],
      ["con un halo enorme (60 px)", /borra lo de alrededor/, () => ({ ...buena, halo: 60 * px })],
      ["con el halo casi pegado (1,5 px más que el trazo)", /pasar al trazo/, () => ({ ...buena, halo: buena.ancho + 1.5 * px })],
      ["sin caminos", /una sola curva|dos patas/, () => ({ ancho: buena.ancho, halo: buena.halo })],
    ];
    for (const [nombre, regla, hacer] of MALAS) {
      const mal = revisarFlecha(hacer(), { desde, hasta, px });
      if (!mal.some((m) => regla.test(m))) fallos.push(`el revisor no caza por su regla una flecha ${nombre}${mal.length ? ` (solo dice: ${mal.join("; ")})` : ""}`);
    }
    // Y las que dependen de dónde está lo señalado o Adeo.
    const POR_SITIO = [
      ["que pisa el aro", /pisa el aro/, { hasta: caja(hasta.left, hasta.top, hasta.right - hasta.left + 12 * px, hasta.bottom - hasta.top) }],
      ["que se queda lejos", /lejos/, { hasta: caja(hasta.left, hasta.top, hasta.right - hasta.left - 40 * px, hasta.bottom - hasta.top) }],
      ["que cruza por encima de Adeo", /esquivar/, { evitar: [caja((buena.ini.x + buena.fin.x) / 2 - 60, (buena.ini.y + buena.fin.y) / 2 - 60, 120, 120)] }],
      ["que no sale del bocadillo", /del bocadillo/, { desde: caja(desde.left + 60 * px, desde.top, desde.right - desde.left, desde.bottom - desde.top) }],
    ];
    for (const [nombre, regla, cambio] of POR_SITIO) {
      const mal = revisarFlecha(buena, { desde, hasta, px, ...cambio });
      if (!mal.some((m) => regla.test(m))) fallos.push(`el revisor no caza por su regla una flecha ${nombre}${mal.length ? ` (solo dice: ${mal.join("; ")})` : ""}`);
    }
    resumen.push(`el revisor caza las ${MALAS.length + POR_SITIO.length} malas por su regla`);
  }
}

// ── 4. Ninguna hoja de estilo cambia lo que se pinta ─────────────────────
// La flecha es un <svg class="adeo-flecha"> con cuatro <path> (dos con la clase
// `adeo-flecha-halo` y dos con `adeo-flecha-trazo`), dentro de
// `div.adeo-capa` < `div.app` < `div#root` < body < html. Una regla que pueda
// llegar a esos caminos no puede tocar nada de lo que decide `flecha.js`: el
// grosor, la forma, si se ve. Solo el color del trazo y del halo (que no sea
// transparente), el `fill: none` y las puntas redondas.
const PROHIBIDAS_CAMINO = new Set([
  "stroke-width", "opacity", "stroke-opacity", "fill-opacity", "display", "visibility", "transform", "scale", "rotate",
  "translate", "zoom", "vector-effect", "d", "stroke-dasharray", "stroke-dashoffset", "paint-order", "marker",
  "marker-start", "marker-mid", "marker-end", "filter", "mask", "clip-path", "stroke-miterlimit", "content-visibility",
]);
const PROHIBIDAS_LIENZO = new Set(["transform", "scale", "rotate", "translate", "zoom", "opacity", "display", "visibility", "filter", "mask", "clip-path", "content-visibility"]);

/** Las reglas de una hoja: `[{ selector, decl: [[prop, valor]], linea }]`, entrando en @media y @supports. */
function reglasCss(texto) {
  const sin = texto.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const out = [];
  const leer = (desde, hasta) => {
    let i = desde, inicio = desde;
    while (i < hasta) {
      const ch = sin[i];
      if (ch === ";" || ch === "}") { inicio = i + 1; i++; continue; }
      if (ch !== "{") { i++; continue; }
      // el cuerpo, con sus llaves
      let prof = 1, j = i + 1;
      while (j < hasta && prof) { if (sin[j] === "{") prof++; else if (sin[j] === "}") prof--; j++; }
      const preludio = sin.slice(inicio, i).trim();
      const cuerpo = [i + 1, j - 1];
      if (/^@(media|supports|layer|container|document|scope)\b/i.test(preludio)) leer(cuerpo[0], cuerpo[1]);
      else if (!preludio.startsWith("@")) {
        const decl = [];
        for (const d of sin.slice(cuerpo[0], cuerpo[1]).split(/;(?![^(]*\))/)) {
          const k = d.indexOf(":");
          if (k > 0) decl.push([d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim()]);
        }
        out.push({ selector: preludio, decl, linea: sin.slice(0, i).split("\n").length });
      }
      i = j;
      inicio = j;
    }
  };
  leer(0, sin.length);
  return out;
}

// `atributos`: los que lleva cada uno (los de explica.js); `null` es que no se
// sabe (la app copia los suyos en <html> y en .app), y entonces cualquiera vale.
const CADENA_CAMINO = [
  { tag: "path", clases: ["adeo-flecha-halo"], atributos: ["class", "d", "stroke-width", "style"] },
  { tag: "path", clases: ["adeo-flecha-trazo"], atributos: ["class", "d", "stroke-width", "style"] },
];
const ANTEPASADOS = [
  { tag: "svg", clases: ["adeo-flecha"], atributos: ["class", "viewbox", "aria-hidden"] },
  { tag: "div", clases: ["adeo-capa"], atributos: ["class", "style", "data-compacto"] },
  { tag: "div", clases: ["app"], atributos: null },
  { tag: "div", clases: [], id: "root", atributos: ["id", "style", "aria-busy"] },
  { tag: "body", clases: [], atributos: null },
  { tag: "html", clases: [], raiz: true, atributos: null },
];

/** Un trozo de selector sin combinadores (`svg.adeo-flecha:hover`) en sus partes. */
function compuesto(t) {
  const sinParen = t.replace(/\((?:[^()]|\([^()]*\))*\)/g, "()");
  return {
    tag: (sinParen.match(/^[a-z][\w-]*|^\*/i) ?? [""])[0].toLowerCase(),
    clases: [...sinParen.matchAll(/\.([\w-]+)/g)].map((m) => m[1]),
    ids: [...sinParen.matchAll(/#([\w-]+)/g)].map((m) => m[1]),
    atributos: [...t.matchAll(/\[\s*([\w-]+)/g)].map((m) => m[1].toLowerCase()),
    pseudoElemento: /::/.test(sinParen),
    raiz: /:root\b/.test(sinParen),
  };
}
/** ¿Puede este trozo ser el elemento `e`? Por lo alto: los estados (:hover, :not…) cuentan como que sí. */
function puedeSer(c, e) {
  if (c.pseudoElemento) return false;
  if (c.tag && c.tag !== "*" && c.tag !== e.tag) return false;
  if (c.raiz && !e.raiz) return false;
  if (c.clases.some((k) => !e.clases.includes(k))) return false;
  if (c.ids.some((k) => k !== e.id)) return false;
  if (e.atributos && c.atributos.some((a) => !e.atributos.includes(a))) return false;
  return true;
}
/** ¿Puede el selector entero llegar a `e` (con sus antepasados de `cadena`)? */
function llega(selector, e, cadena) {
  for (const uno of selector.split(/,(?![^(]*\))/)) {
    const partes = uno.trim().replace(/\s*([>+~])\s*/g, " ").split(/\s+/).filter(Boolean);
    if (!partes.length) continue;
    if (!puedeSer(compuesto(partes.at(-1)), e)) continue;
    // Cada antepasado del selector tiene que poder ser alguno de la cadena, en orden.
    let k = 0, vale = true;
    for (const p of partes.slice(0, -1).reverse()) {
      while (k < cadena.length && !puedeSer(compuesto(p), cadena[k])) k++;
      if (k >= cadena.length) { vale = false; break; }
      k++;
    }
    if (vale) return true;
  }
  return false;
}
const alfa = (v) => {
  const s = v.toLowerCase().replace(/\s*!important\s*$/, "").trim();
  if (s === "transparent" || s === "none") return 0;
  let m = s.match(/^rgba?\(([^)]*)\)$|^hsla?\(([^)]*)\)$/);
  if (m) {
    const partes = (m[1] ?? m[2]).split(/[\s,/]+/).filter(Boolean);
    if (partes.length === 4) return partes[3].endsWith("%") ? parseFloat(partes[3]) / 100 : parseFloat(partes[3]);
    return 1;
  }
  m = s.match(/^#([0-9a-f]{8}|[0-9a-f]{4})$/);
  if (m) return parseInt(m[1].length === 8 ? m[1].slice(6) : m[1][3].repeat(2), 16) / 255;
  return 1;
};
function revisarHoja(texto, nombre) {
  const mal = [];
  for (const r of reglasCss(texto)) {
    const alCamino = CADENA_CAMINO.some((e) => llega(r.selector, e, ANTEPASADOS));
    const alLienzo = llega(r.selector, ANTEPASADOS[0], ANTEPASADOS.slice(1));
    if (!alCamino && !alLienzo) continue;
    const propia = /adeo-flecha/.test(r.selector);
    for (const [prop, valor] of r.decl) {
      const donde = `${nombre}:${r.linea} «${r.selector}»`;
      // Mostrar algo no la cambia; esconderlo, sí.
      if ((prop === "display" && !/^(none|contents)\b/i.test(valor)) || (prop === "visibility" && !/^(hidden|collapse)\b/i.test(valor))) continue;
      if (alCamino && PROHIBIDAS_CAMINO.has(prop)) mal.push(`${donde} pone \`${prop}: ${valor}\` a los caminos de la flecha: eso lo decide flecha.js`);
      else if (alLienzo && !alCamino && PROHIBIDAS_LIENZO.has(prop)) mal.push(`${donde} pone \`${prop}: ${valor}\` al lienzo de la flecha: la encoge, la gira o la apaga`);
      else if (alLienzo && !alCamino && /^(width|height)$/.test(prop) && propia && valor.replace(/\s*!important/, "") !== (prop === "width" ? "1920px" : "1080px")) mal.push(`${donde} da al lienzo de la flecha \`${prop}: ${valor}\`: tiene que medir lo que su viewBox (1920 x 1080) o el trazo cambia de grosor`);
      else if (alCamino && prop === "stroke" && alfa(valor) < 0.5) mal.push(`${donde} deja el trazo o el halo de la flecha casi transparente (\`stroke: ${valor}\`)`);
      else if (alCamino && propia && prop === "fill" && !/^none\b/i.test(valor)) mal.push(`${donde} rellena la flecha (\`fill: ${valor}\`): una curva rellena es una mancha`);
      else if (alCamino && propia && prop === "stroke-linecap" && !/^round\b/i.test(valor)) mal.push(`${donde} quita las puntas redondas (\`stroke-linecap: ${valor}\`)`);
    }
  }
  return mal;
}
// El detector de hojas, con lo que se le escapaba y con lo que no es de la flecha.
const PRUEBAS_DE_HOJAS = [
  ["el stroke-width que pisaba el atributo", true, ".adeo-flecha path { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2px; }"],
  ["el halo transparente", true, ".adeo-flecha-halo { stroke: transparent; }"],
  ["un svg path genérico con grosor", true, "@media (max-width: 600px) { svg path { stroke-width: 1px } }"],
  ["el lienzo encogido", true, ".adeo-capa svg { transform: scale(.5) }"],
  ["el lienzo a 960 de ancho", true, ".adeo-flecha { width: 960px }"],
  ["el trazo con opacidad", true, ".adeo-flecha-trazo { stroke: color-mix(in srgb, var(--accent) 88%, #fff); opacity: .3 }"],
  ["la flecha de hoy", false, ".adeo-flecha { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: visible; }\n.adeo-flecha path { fill: none; stroke-linecap: round; stroke-linejoin: round; }\n.adeo-flecha-trazo { stroke: color-mix(in srgb, var(--accent) 88%, #fff); }\n.adeo-flecha-halo { stroke: rgba(4, 8, 16, .62); }"],
  ["los hilos del mapa", false, ".mapa-hilo path { fill: none; stroke: currentcolor; stroke-width: 1.6px; stroke-opacity: 0.55; }"],
  ["los iconos de los botones", false, ".pane-btn svg path { stroke-width: 1.9 }\n.react-flow__edge-path { stroke-width: 2 }"],
  ["el grosor solo en el móvil", true, ".adeo-capa[data-compacto] .adeo-flecha path { stroke-width: 3px }"],
  ["un path[d] cualquiera", true, "path[d] { stroke-width: 1px }"],
  ["lo que esconde [hidden] y lo que aparece", false, "[hidden] { display: none !important }\n[data-aparece] { opacity: 0; transform: translateY(20px) }\nimg, svg { display: block }"],
];
for (const [nombre, esMala, texto] of PRUEBAS_DE_HOJAS) {
  if (revisarHoja(texto, "prueba").length > 0 !== esMala) fallos.push(`el detector de hojas se equivoca con ${nombre}: la da por ${esMala ? "buena" : "mala"}`);
}
// Todas las hojas de la web, y los <style> de sus páginas.
{
  let hojas = 0;
  for (const { ruta, rel } of archivosDeLaWeb(/\.(css|html?)$/i)) {
    const texto = fs.readFileSync(ruta, "utf8");
    const trozos = /\.css$/i.test(rel) ? [texto] : [...texto.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    for (const t of trozos) { hojas++; fallos.push(...revisarHoja(t, rel)); }
  }
  resumen.push(`${hojas} hojas sin tocar el grosor (y el detector de hojas, sus ${PRUEBAS_DE_HOJAS.length} pruebas)`);
}

// ── 5. Lo que pinta explica.js, montado en jsdom ─────────────────────────
// Se le dan cajas de mentira (el bocadillo de 300 x 120 px de pantalla, Adeo de
// 50 x 60 a su izquierda y apoyado abajo, como en demo.css), se le hace dar el
// recorrido señalando cajas por toda la ventana, a cinco escalas, y se mide lo
// que deja en el <svg class="adeo-flecha">: tiene que ser una flecha de
// `flecha.js` que pase su revisión contra lo señalado DE VERDAD, del bocadillo
// (o del bocadillo con Adeo) y sin cruzar a Adeo, o nada; y si `flechaBuena`
// da una en ese sitio, explica.js tiene que pintarla.
const EXPLICA = path.join(RAIZ, "web/demo/explica.js");
async function pintadoDeExplica() {
  const { JSDOM } = await cargar("jsdom");
  const dom = new JSDOM('<!doctype html><html lang="es"><body><div id="root"><div class="app"></div></div></body></html>', {
    url: "http://127.0.0.1/demo/?motion=off",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  let k = 1;
  const BOC = [300, 120], CARA = [50, 60], HUECO_CARA = 6;
  const fijas = new Map();
  const enDibujo = (r) => ({ left: r.left / k, top: r.top / k, right: r.right / k, bottom: r.bottom / k, width: r.width / k, height: r.height / k });
  const enPantalla = (b) => ({ left: b.left * k, top: b.top * k, right: b.right * k, bottom: b.bottom * k, width: (b.right - b.left) * k, height: (b.bottom - b.top) * k, x: b.left * k, y: b.top * k });
  const cajaDe = (el) => {
    if (fijas.has(el)) return fijas.get(el);
    const dice = el.closest?.(".adeo-dice");
    if (!dice) return null;
    const px = 1 / k;
    const x = parseFloat(dice.style.left) || 0, y = parseFloat(dice.style.top) || 0;
    const conCara = !!dice.querySelector(".adeo-cara");
    const cw = conCara ? (CARA[0] + HUECO_CARA) * px : 0;
    const W = cw + BOC[0] * px, H = BOC[1] * px;
    if (el === dice) return { left: x, top: y, right: x + W, bottom: y + H };
    if (el.classList.contains("adeo-cara")) return { left: x, top: y + H - CARA[1] * px, right: x + CARA[0] * px, bottom: y + H };
    if (el.classList.contains("adeo-bocadillo")) return { left: x + cw, top: y, right: x + W, bottom: y + H };
    return null;
  };
  // Una animación, como en el navegador: desde su primer fotograma el elemento
  // va donde dice su primer paso, y `getBoundingClientRect` lo cuenta (el
  // bocadillo entra corrido 12 px por `aparecer`). Al acabar cada parada se dan
  // por terminadas, y lo pintado se mide con todo ya quieto.
  const deslizados = new Set();
  const desliz = (tr) => {
    const s = String(tr ?? "");
    let dx = 0, dy = 0, m;
    if ((m = s.match(/translateX\(\s*(-?[\d.]+)px/))) dx += +m[1];
    if ((m = s.match(/translateY\(\s*(-?[\d.]+)px/))) dy += +m[1];
    if ((m = s.match(/translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/))) { dx += +m[1]; dy += +m[2]; }
    return dx || dy ? { dx, dy } : null;
  };
  w.Element.prototype.getBoundingClientRect = function () {
    const b = cajaDe(this);
    if (!b) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    let dx = 0, dy = 0;
    for (let el = this; el; el = el.parentElement) if (el.__desliz) { dx += el.__desliz.dx; dy += el.__desliz.dy; }
    return enPantalla({ left: b.left + dx, top: b.top + dy, right: b.right + dx, bottom: b.bottom + dy });
  };
  w.Element.prototype.getClientRects = function () { return cajaDe(this) ? [this.getBoundingClientRect()] : []; };
  w.Element.prototype.animate = function (pasos) {
    const d = desliz(Array.isArray(pasos) ? pasos[0]?.transform : null);
    if (d) { this.__desliz = d; deslizados.add(this); }
    return { finished: Promise.resolve(), cancel() {}, finish() {}, addEventListener() {} };
  };
  w.Element.prototype.scrollIntoView = function () {};
  w.SVGElement.prototype.getTotalLength = function () { return 100; };
  // jsdom no mide SVG: la caja de lo que hay dentro, por sus puntos y controles.
  w.SVGElement.prototype.getBBox = function () {
    const ps = [];
    const de = (el) => {
      if (el.getAttribute?.("d")) for (const s of tramos(el.getAttribute("d"))) ps.push(s.a, s.b, ...(s.ctrl ?? []));
      for (const h of el.children ?? []) de(h);
    };
    de(this);
    if (!ps.length) return { x: 0, y: 0, width: 0, height: 0 };
    const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.scrollTo = w.scrollBy = () => {};
  const globales = {
    window: w, document: w.document, localStorage: w.localStorage, location: w.location,
    getComputedStyle: w.getComputedStyle.bind(w), matchMedia: w.matchMedia,
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: (n) => clearTimeout(n),
    addEventListener: w.addEventListener.bind(w), removeEventListener: w.removeEventListener.bind(w),
    innerWidth: 1920, innerHeight: 1080, scrollTo: w.scrollTo, scrollBy: w.scrollBy,
  };
  for (const [n, v] of Object.entries(globales)) Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true });

  const { prepararAdeo } = await import(pathToFileURL(EXPLICA).href);
  const app = w.document.querySelector(".app");
  const adeo = prepararAdeo({ app, EN: false, dentro: (r) => enDibujo(r), escala: () => k, casa: () => null, pegado: () => [] });

  const res = { pasos: 0, pintadas: 0, debia: 0, mal: [] };
  const NS = "http://www.w3.org/2000/svg";
  const objetivo = w.document.createElement("div");
  objetivo.className = "objetivo-de-prueba";
  app.appendChild(objetivo);
  const anchoDe = (p) => parseFloat(p.style?.strokeWidth || p.getAttribute("stroke-width"));
  const lados = [undefined, "abajo", "arriba", "derecha", "izquierda"];
  for (const ancho of [1400, 1120, 1000, 700, 500]) {
    k = ancho / 1920;
    const px = 1 / k;
    for (let i = 0; i < 24; i++) {
      const tw = 40 + azar() * 520, th = 24 + azar() * 360;
      const hasta = caja(30 + azar() * (1860 - tw), 30 + azar() * (1020 - th), tw, th);
      fijas.set(objetivo, hasta);
      for (const lado of lados) {
        res.pasos++;
        // Una parada con el movimiento encendido (lo que ve casi todo el mundo) y otra con la válvula parada.
        const movimiento = res.pasos % 2 ? "full" : "off";
        Object.defineProperty(globalThis, "location", { value: { search: `?motion=${movimiento}`, href: `http://127.0.0.1/demo/?motion=${movimiento}` }, configurable: true, writable: true });
        adeo.recorrido([{ el: () => objetivo, titulo: "Prueba", texto: "Una parada de prueba.", lado }]);
        for (const el of deslizados) delete el.__desliz;
        deslizados.clear();
        const lienzo = app.querySelector("svg.adeo-flecha");
        const dice = app.querySelector(".adeo-dice");
        const boc = dice?.querySelector(".adeo-bocadillo");
        const suCara = dice?.querySelector(".adeo-cara");
        const desde = boc && cajaDe(boc);
        const cara = suCara ? cajaDe(suCara) : null;
        const donde = `a ${ancho} px de demo, señalando ${JSON.stringify(Object.fromEntries(Object.entries(hasta).map(([a, b]) => [a, Math.round(b)])))}${lado ? ` con el bocadillo ${lado}` : ""}`;
        if (!lienzo || lienzo.namespaceURI !== NS) { res.mal.push(`no hay <svg class="adeo-flecha"> ${donde}`); adeo.parar(); continue; }
        if (lienzo.getAttribute("viewBox") !== "0 0 1920 1080") res.mal.push(`el lienzo de la flecha lleva viewBox «${lienzo.getAttribute("viewBox")}»: con otro que no sea 0 0 1920 1080 el trazo cambia de grosor`);
        const hijos = [...lienzo.children];
        const debia = desde && (flechaBuena({ desde, hasta, px, comba: 1, evitar: cara ? [cara] : [] }) ?? (cara ? flechaBuena({ desde: juntar(desde, cara), hasta, px, comba: 1 }) : null));
        if (debia) res.debia++;
        if (!hijos.length) {
          if (debia) res.mal.push(`explica.js no pinta flecha ${donde}, y flechaBuena da una`);
          adeo.parar();
          continue;
        }
        res.pintadas++;
        const caminos = hijos.filter((h) => h.localName === "path");
        const halo = caminos.filter((h) => h.getAttribute("class") === "adeo-flecha-halo");
        const trazo = caminos.filter((h) => h.getAttribute("class") === "adeo-flecha-trazo");
        if (hijos.length !== 4 || halo.length !== 2 || trazo.length !== 2) {
          res.mal.push(`el lienzo lleva ${hijos.length} piezas (${hijos.map((h) => `${h.localName}.${h.getAttribute("class")}`).join(", ")}) ${donde}: una flecha son dos caminos de halo y dos de trazo`);
          adeo.parar();
          continue;
        }
        const ds = (xs) => xs.map((h) => h.getAttribute("d")).sort().join(" | ");
        if (ds(halo) !== ds(trazo)) res.mal.push(`el halo no va por donde el trazo ${donde}`);
        for (const h of caminos) {
          const s = h.style;
          for (const prop of ["opacity", "visibility", "display", "transform", "stroke", "strokeOpacity", "vectorEffect", "d"]) {
            if (s?.[prop]) res.mal.push(`un camino de la flecha lleva \`style.${prop} = ${s[prop]}\` ${donde}: eso lo decide flecha.js`);
          }
        }
        const anchos = (xs) => [...new Set(xs.map(anchoDe))];
        const [aT, aH] = [anchos(trazo), anchos(halo)];
        if (aT.length > 1 || aH.length > 1) res.mal.push(`el tallo y la punta se pintan con anchos distintos ${donde}`);
        // El tallo es el camino con C; la punta, el otro.
        const tallo = trazo.find((h) => /C/i.test(h.getAttribute("d"))) ?? trazo[0];
        const punta = trazo.find((h) => h !== tallo);
        const g = { tallo: tallo.getAttribute("d"), punta: punta.getAttribute("d"), ancho: aT[0], halo: aH[0] };
        const solo = revisarFlecha(g, { desde, hasta, px, evitar: cara ? [cara] : [] });
        const conAdeo = cara ? revisarFlecha(g, { desde: juntar(desde, cara), hasta, px }) : solo;
        if (solo.length && conAdeo.length) res.mal.push(`lo que pinta explica.js ${donde} no pasa: ${solo.join("; ")}`);
        adeo.parar();
      }
    }
  }
  w.close();
  return res;
}
try {
  const r = await pintadoDeExplica();
  if (r.mal.length) fallos.push(`explica.js pinta flechas malas en ${r.mal.length} de ${r.pasos} paradas:\n    ${[...new Set(r.mal)].slice(0, 6).join("\n    ")}`);
  if (r.pintadas < 60) fallos.push(`explica.js solo pinta ${r.pintadas} flechas en ${r.pasos} paradas de prueba (debía ${r.debia}): o no pinta, o la prueba no muerde`);
  resumen.push(`explica.js pinta ${r.pintadas} flechas buenas en ${r.pasos} paradas (las ${r.debia} que cabían)`);
} catch (e) {
  fallos.push(`no se pudo montar explica.js en jsdom para medir lo que pinta: ${e?.stack?.split("\n").slice(0, 3).join(" · ") ?? e}`);
}

// ── 6. Nadie en la web dibuja una flecha por su cuenta ───────────────────
// Se lee cada .js, .mjs y .html de web/ como lo que es: el JavaScript, con su
// árbol de sintaxis (para seguir una clase que llega por parámetro o se pone
// diez líneas más abajo), y el marcado, etiqueta a etiqueta. Es una flecha
// dibujada a mano:
//   · un camino (<path>, <polyline>, <polygon>, <line>) con un trazo doblado o
//     curvo que acaba en una punta de dos patas, se llame como se llame, salvo
//     dentro de un icono (un <svg> o <symbol> de 32 unidades o menos);
//   · un camino que se llama flecha o arrow (su clase, su id, su variable o la
//     clase que le pasan) y se curva de verdad, o cuyo `d` se calcula, salvo
//     que el archivo saque la flecha de `flechaBuena`;
//   · un canvas que traza líneas o curvas donde dice flecha o arrow.
// Los iconos de flecha de la web son rectos (`i-flecha`: un tallo recto con su
// punta) o un chevrón (`pregunta__flecha`), y no salen.
const SE_LLAMA_FLECHA = /flech|arrow/i;
const FORMAS = new Set(["path", "polyline", "polygon", "line"]);
const ICONO = 32;

const puntosATramos = (pts, cerrar) => {
  const n = String(pts).match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g)?.map(Number) ?? [];
  const ps = [];
  for (let i = 0; i + 1 < n.length; i += 2) ps.push(`${n[i]} ${n[i + 1]}`);
  return ps.length < 2 ? "" : `M${ps.join(" L")}${cerrar ? " Z" : ""}`;
};
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
/** Cuánto se aparta un tramo de su cuerda, en partes de la cuerda. */
function comba(s) {
  const c = dist(s.a, s.b);
  if (!s.curva) return 0;
  if (c < 1e-9) return Infinity;
  if (s.arco) {
    const r = s.arco.r;
    if (c >= 2 * r) return 0.5;
    const sagita = s.arco.grande ? r + Math.sqrt(r * r - (c / 2) ** 2) : r - Math.sqrt(r * r - (c / 2) ** 2);
    return sagita / c;
  }
  return Math.max(...s.ctrl.map((p) => Math.abs((s.b.x - s.a.x) * (p.y - s.a.y) - (s.b.y - s.a.y) * (p.x - s.a.x)) / c)) / c;
}
function diagonal(ts) {
  const xs = ts.flatMap((s) => [s.a.x, s.b.x]), ys = ts.flatMap((s) => [s.a.y, s.b.y]);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
}
/** Una curva de verdad: no el redondeo de una esquina. */
const curvaDeVerdad = (ts) => {
  const diag = diagonal(ts);
  return ts.some((s) => s.curva && comba(s) >= 0.1 && dist(s.a, s.b) >= 0.25 * diag);
};
/** ¿Hay un trazo doblado o curvo que acaba en una punta de dos patas? */
function esFlechaDibujada(ts) {
  if (ts.length < 3) return false;
  const tol = 1e-6 + 0.002 * diagonal(ts);
  const mismo = (p, q) => dist(p, q) <= tol;
  for (const v of ts.flatMap((s) => [s.a, s.b])) {
    const tocan = ts.filter((s) => mismo(s.a, v) || mismo(s.b, v));
    if (tocan.length < 3) continue;
    const otro = (s) => (mismo(s.a, v) ? s.b : s.a);
    for (const tallo of tocan) {
      const lTallo = dist(tallo.a, tallo.b);
      if (lTallo < 1e-9) continue;
      // Por dónde llega el tallo a la punta: de su último control, o de su otro extremo.
      const entra = tallo.curva && tallo.ctrl?.length ? (mismo(tallo.b, v) ? tallo.ctrl.at(-1) : tallo.ctrl[0]) : otro(tallo);
      const lejos = otro(tallo);
      const doblado = (tallo.curva && comba(tallo) >= 0.1) || ts.some((s) => {
        if (s === tallo || s.curva || !(mismo(s.a, lejos) || mismo(s.b, lejos))) return false;
        const u = { x: v.x - lejos.x, y: v.y - lejos.y };
        const q = mismo(s.a, lejos) ? s.b : s.a;
        const w = { x: lejos.x - q.x, y: lejos.y - q.y };
        const cos = (u.x * w.x + u.y * w.y) / ((Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y)) || 1);
        return cos < Math.cos(0.26);
      });
      if (!doblado) continue;
      const atras = { x: entra.x - v.x, y: entra.y - v.y };
      const la = Math.hypot(atras.x, atras.y) || 1;
      const patas = new Map();
      for (const s of tocan) {
        if (s === tallo || s.curva) continue;
        const o = otro(s);
        const l = dist(o, v);
        if (l < 1e-9 || l > 1.2 * lTallo) continue;
        const cos = ((o.x - v.x) * atras.x + (o.y - v.y) * atras.y) / (l * la);
        if (cos > Math.cos(1.4)) patas.set(`${o.x.toFixed(2)},${o.y.toFixed(2)}`, o);
      }
      if (patas.size >= 2) return true;
    }
  }
  return false;
}

/** Lo que hay de flecha en un trozo de marcado (un .html, o el HTML dentro de una cadena de JS). */
function enMarcado(texto, { linea0 = 1, licencia = false } = {}) {
  const mal = [];
  const pila = [];
  const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)].map((m) => [m[1].toLowerCase(), m[3] ?? m[4]]));
  const re = /<(svg|symbol)\b([^>]*)>|<\/(svg|symbol)\s*>|<(path|polyline|polygon|line)\b([^>]*)>/gi;
  for (const m of texto.matchAll(re)) {
    if (m[1]) { pila.push(attrs(m[2])); continue; }
    if (m[3]) { pila.pop(); continue; }
    const forma = m[4].toLowerCase();
    const a = attrs(m[5]);
    const linea = linea0 + texto.slice(0, m.index).split("\n").length - 1;
    const nombres = [a.class, a.id, ...pila.flatMap((p) => [p.class, p.id])].filter(Boolean).join(" ");
    const icono = pila.some((p) => {
      const vb = String(p.viewbox ?? "").split(/[\s,]+/).map(Number);
      return vb.length === 4 && vb[2] <= ICONO && vb[3] <= ICONO;
    });
    if (icono) continue;
    const geo = forma === "path" ? a.d : forma === "line" ? (a.x1 != null ? `M${a.x1} ${a.y1} L${a.x2} ${a.y2}` : null) : a.points != null ? puntosATramos(a.points, forma === "polygon") : null;
    const calculado = geo == null || geo.includes("\u0000") || /\$\{/.test(geo);
    const ts = calculado ? [] : tramos(geo);
    const llamada = SE_LLAMA_FLECHA.test(nombres);
    if (!calculado && esFlechaDibujada(ts)) mal.push({ linea, regla: "dibujo", texto: `un <${forma}> que dibuja una flecha (trazo curvo o doblado con su punta)${nombres ? ` («${nombres}»)` : ""}` });
    else if (llamada && !calculado && curvaDeVerdad(ts)) mal.push({ linea, regla: "nombre", texto: `un <${forma}> «${nombres}» con un trazo curvo: una flecha dibujada a mano` });
    else if (llamada && calculado && !licencia) mal.push({ linea, regla: "calculada", texto: `un <${forma}> «${nombres}» con el trazo calculado y sin flechaBuena` });
  }
  return mal;
}

/** Lo que hay de flecha en un JavaScript. */
function enJavaScript(codigo, { parser, linea0 = 1 }) {
  const mal = [];
  let ast;
  try {
    ast = parser.parse(codigo, { sourceType: "unambiguous", errorRecovery: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
  } catch (e) {
    return [{ linea: linea0, regla: "lectura", texto: `no se puede leer como JavaScript (${e.message}): un archivo que no se lee no se vigila` }];
  }
  const fuente = (n) => codigo.slice(n.start, n.end);
  const lin = (n) => linea0 + (n.loc?.start.line ?? 1) - 1;
  // Recorrido con los padres.
  const nodos = [];
  const padresDe = new Map();
  (function andar(n, padres) {
    if (!n || typeof n.type !== "string") return;
    nodos.push({ n, padres });
    padresDe.set(n, padres);
    const ps = [...padres, n];
    for (const k of Object.keys(n)) {
      if (k === "loc" || k === "start" || k === "end" || k === "leadingComments" || k === "trailingComments" || k === "innerComments" || k === "extra") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => andar(x, ps));
      else if (v && typeof v.type === "string") andar(v, ps);
    }
  })(ast.program, []);
  const esFuncion = (n) => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod|ClassMethod)$/.test(n.type);
  const nombreDeFuncion = (f, padres) => {
    if (f.id?.name) return f.id.name;
    const p = padres.at(-1);
    if (p?.type === "VariableDeclarator" && p.id.type === "Identifier") return p.id.name;
    if ((p?.type === "ObjectProperty" || p?.type === "ClassProperty") && p.key) return p.key.name ?? p.key.value;
    if (f.key) return f.key.name ?? f.key.value;
    if (p?.type === "AssignmentExpression") return fuente(p.left);
    return null;
  };
  const funcionDe = (padres) => {
    for (let i = padres.length - 1; i >= 0; i--) if (esFuncion(padres[i])) return { f: padres[i], nombre: nombreDeFuncion(padres[i], padres.slice(0, i)) ?? "(sin nombre)" };
    return { f: ast.program, nombre: "(arriba del todo)" };
  };
  // Las constantes de texto del archivo, y las funciones por su nombre.
  const constantes = new Map();
  const funciones = new Map();
  const nombreDe = new Map();
  for (const { n } of nodos) {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init) {
      if (n.init.type === "StringLiteral") constantes.set(n.id.name, n.init.value);
      else if (n.init.type === "TemplateLiteral" && !n.init.expressions.length) constantes.set(n.id.name, n.init.quasis[0].value.cooked);
      if (esFuncion(n.init)) { funciones.set(n.id.name, n.init); nombreDe.set(n.init, n.id.name); }
    }
    if (n.type === "FunctionDeclaration" && n.id) { funciones.set(n.id.name, n); nombreDe.set(n, n.id.name); }
  }
  const llamadasA = new Map();
  for (const { n } of nodos) {
    if (n.type === "CallExpression" && n.callee.type === "Identifier") {
      if (!llamadasA.has(n.callee.name)) llamadasA.set(n.callee.name, []);
      llamadasA.get(n.callee.name).push(n);
    }
  }
  /** Los textos que puede valer una expresión: literal, constante, plantilla, o el parámetro que llega en cada llamada. */
  const valores = (e, f, prof = 0) => {
    if (!e) return { textos: [], calculado: true };
    if (e.type === "StringLiteral") return { textos: [e.value], calculado: false };
    if (e.type === "TemplateLiteral") return { textos: [e.quasis.map((q) => q.value.cooked).join("\u0000")], calculado: e.expressions.length > 0 };
    if (e.type === "BinaryExpression" && e.operator === "+") {
      const a = valores(e.left, f, prof), b = valores(e.right, f, prof);
      return { textos: [a.textos.join("") + b.textos.join("")], calculado: a.calculado || b.calculado };
    }
    if (e.type === "Identifier") {
      if (constantes.has(e.name)) return { textos: [constantes.get(e.name)], calculado: false };
      const i = f?.params?.findIndex((p) => p.type === "Identifier" && p.name === e.name) ?? -1;
      const nombre = f && nombreDe.get(f);
      if (i >= 0 && nombre && prof < 3) {
        const r = { textos: [e.name], calculado: false };
        for (const c of llamadasA.get(nombre) ?? []) {
          const v = valores(c.arguments[i], funcionDe(padresDe.get(c)).f, prof + 1);
          r.textos.push(...v.textos);
          r.calculado ||= v.calculado;
        }
        return r;
      }
      return { textos: [e.name], calculado: true };
    }
    return { textos: [fuente(e).slice(0, 80)], calculado: true };
  };
  // ¿Saca la flecha de flecha.js? Solo `flechaBuena` de verdad, no otra cosa con su nombre.
  let licencia = false;
  for (const { n } of nodos) {
    if (n.type === "ImportDeclaration" && /(^|\/)flecha\.js$/.test(n.source.value)) {
      for (const s of n.specifiers) if (s.type === "ImportSpecifier" && (s.imported.name ?? s.imported.value) === "flechaBuena") licencia = true;
    }
  }
  for (const nombre of ["flechaBuena", "trazarFlecha", "revisarFlecha", "leerFlecha"]) {
    if (funciones.has(nombre)) mal.push({ linea: lin(funciones.get(nombre)), regla: "propia", texto: `hace su propia \`${nombre}\`: la flecha sale de web/demo/flecha.js` });
  }
  for (const { n } of nodos) {
    if (n.type === "Identifier" && n.name === "trazarFlecha") { mal.push({ linea: lin(n), regla: "trazar", texto: "usa `trazarFlecha`, que traza sin revisar: lo que se pinta sale de `flechaBuena`" }); break; }
  }
  // Las ayudas que crean un elemento SVG con la etiqueta que les pasan.
  const ayudas = new Map();
  for (const [nombre, f] of funciones) {
    const cuerpo = fuente(f);
    for (const [i, p] of (f.params ?? []).entries()) {
      if (p.type === "Identifier" && new RegExp(`createElementNS\\s*\\([^,()]+,\\s*${p.name}\\s*\\)`).test(cuerpo)) ayudas.set(nombre, i);
    }
  }
  const propiedad = (m) => (m.type === "MemberExpression" ? (m.property.name ?? m.property.value) : null);
  const variablesCreadas = new Set();
  for (const { n, padres } of nodos) {
    if (n.type !== "CallExpression") continue;
    let forma = null;
    if (propiedad(n.callee) === "createElementNS") forma = valores(n.arguments[1], funcionDe(padres).f).textos[0];
    else if (n.callee.type === "Identifier" && ayudas.has(n.callee.name)) forma = valores(n.arguments[ayudas.get(n.callee.name)], funcionDe(padres).f).textos[0];
    if (!FORMAS.has(String(forma).toLowerCase())) continue;
    forma = String(forma).toLowerCase();
    const { f, nombre: suFuncion } = funcionDe(padres);
    const p = padres.at(-1);
    const variable = p?.type === "VariableDeclarator" && p.id.type === "Identifier" ? p.id.name : p?.type === "AssignmentExpression" && p.left.type === "Identifier" ? p.left.name : null;
    const nombres = [variable ?? ""];
    const geos = [];
    let calculado = !variable;
    if (variable) {
      variablesCreadas.add(`${suFuncion}:${variable}`);
      // Todo lo que se le hace a esa variable dentro de su función.
      for (const { n: u, padres: up } of nodos) {
        if (funcionDe(up).f !== f) continue;
        if (u.type === "CallExpression" && u.callee.type === "MemberExpression") {
          const obj = u.callee.object;
          const m = propiedad(u.callee);
          const sobre = obj.type === "Identifier" && obj.name === variable;
          const sobreLista = obj.type === "MemberExpression" && obj.object.type === "Identifier" && obj.object.name === variable && propiedad(obj) === "classList";
          if (sobre && (m === "setAttribute" || m === "setAttributeNS")) {
            const args = m === "setAttributeNS" ? u.arguments.slice(1) : u.arguments;
            const clave = valores(args[0], f).textos[0];
            const v = valores(args[1], f);
            if (/^(class|id)$/.test(clave)) nombres.push(...v.textos);
            if (/^(d|points)$/.test(clave)) { if (v.calculado) calculado = true; else geos.push(clave === "points" ? puntosATramos(v.textos.at(-1), forma === "polygon") : v.textos.at(-1)); }
          }
          if (sobreLista && m === "add") for (const a of u.arguments) nombres.push(...valores(a, f).textos);
        }
        if (u.type === "AssignmentExpression" && u.left.type === "MemberExpression" && u.left.object.type === "Identifier" && u.left.object.name === variable && /^(className|id)$/.test(propiedad(u.left))) nombres.push(...valores(u.right, f).textos);
      }
      if (!geos.length) calculado = true;
    }
    const llamada = SE_LLAMA_FLECHA.test(nombres.join(" "));
    for (const g of geos) {
      const ts = tramos(g);
      if (esFlechaDibujada(ts)) mal.push({ linea: lin(n), funcion: suFuncion, regla: "dibujo", texto: `crea un <${forma}> que dibuja una flecha (trazo curvo o doblado con su punta, «${g.slice(0, 50)}»)` });
      else if (llamada && curvaDeVerdad(ts)) mal.push({ linea: lin(n), funcion: suFuncion, regla: "nombre", texto: `crea un <${forma}> «${nombres.filter(Boolean).join(" ")}» con un trazo curvo: una flecha dibujada a mano` });
    }
    if (llamada && calculado && !licencia) mal.push({ linea: lin(n), funcion: suFuncion, regla: "calculada", texto: `crea un <${forma}> «${nombres.filter(Boolean).join(" ")}» con el trazo calculado, sin sacarlo de flechaBuena` });
  }
  // A un camino que ya existe le cambian el `d`.
  for (const { n, padres } of nodos) {
    if (n.type !== "CallExpression" || propiedad(n.callee) !== "setAttribute") continue;
    const { f, nombre: suFuncion } = funcionDe(padres);
    const clave = valores(n.arguments[0], f).textos[0];
    if (!/^(d|points)$/.test(clave)) continue;
    const obj = n.callee.object;
    if (obj.type === "Identifier" && variablesCreadas.has(`${suFuncion}:${obj.name}`)) continue;
    const v = valores(n.arguments[1], f);
    const nombres = [fuente(obj), suFuncion];
    // El bucle que la recorre: `for (const p of $$('path', flecha))`.
    for (const p of padres) if (p.type === "ForOfStatement" || p.type === "ForInStatement") nombres.push(fuente(p.right));
    const llamada = SE_LLAMA_FLECHA.test(nombres.join(" "));
    if (v.calculado) { if (llamada && !licencia) mal.push({ linea: lin(n), funcion: suFuncion, regla: "calculada", texto: `cambia el trazo de «${nombres.join(" · ").slice(0, 80)}» con un \`d\` calculado, sin sacarlo de flechaBuena` }); }
    else {
      const ts = tramos(v.textos.at(-1));
      if (esFlechaDibujada(ts)) mal.push({ linea: lin(n), funcion: suFuncion, regla: "dibujo", texto: `le pone a «${fuente(obj)}» un trazo que dibuja una flecha` });
      else if (llamada && curvaDeVerdad(ts)) mal.push({ linea: lin(n), funcion: suFuncion, regla: "nombre", texto: `le pone a «${fuente(obj)}» un trazo curvo que se llama flecha` });
    }
  }
  // El canvas: líneas o curvas donde dice flecha.
  const LINEAS = new Set(["lineTo", "bezierCurveTo", "quadraticCurveTo", "arcTo"]);
  const porBloque = new Map();
  for (const { n, padres } of nodos) {
    if (n.type !== "CallExpression" || !LINEAS.has(propiedad(n.callee))) continue;
    let b = padres.length - 1;
    while (b > 0 && padres[b].type !== "BlockStatement" && padres[b].type !== "Program") b--;
    const bloque = padres[b];
    if (!porBloque.has(bloque)) porBloque.set(bloque, { llamadas: [], padres: padres.slice(0, b) });
    porBloque.get(bloque).llamadas.push(n);
  }
  const lineas = codigo.split("\n");
  for (const [bloque, { llamadas, padres }] of porBloque) {
    const desde = Math.max(0, (llamadas[0].loc?.start.line ?? 1) - 4), hasta = llamadas.at(-1).loc?.end.line ?? 1;
    let texto = lineas.slice(desde, hasta).join("\n");
    const si = padres.at(-1);
    if (si?.type === "IfStatement" && si.consequent === bloque) texto += "\n" + fuente(si.test);
    const conPath2D = /new\s+Path2D\s*\(/.test(fuente(bloque));
    if (SE_LLAMA_FLECHA.test(texto) && !(licencia && conPath2D)) mal.push({ linea: lin(llamadas[0]), funcion: funcionDe([...padres, bloque]).nombre, regla: "canvas", texto: "traza en un canvas una flecha a mano" });
  }
  // Y el marcado que va dentro de las cadenas (un innerHTML, una plantilla).
  for (const { n } of nodos) {
    if (n.type !== "StringLiteral" && n.type !== "TemplateLiteral") continue;
    const texto = n.type === "StringLiteral" ? n.value : n.quasis.map((q) => q.value.cooked).join("\u0000");
    if (!/<(path|polyline|polygon|line)\b/i.test(texto)) continue;
    for (const h of enMarcado(texto, { linea0: lin(n), licencia })) mal.push(h);
  }
  return mal;
}

/** Lo que hay de flecha en un archivo de la web, por su extensión. */
function revisarArchivo(texto, nombre, parser) {
  if (/\.html?$/i.test(nombre)) {
    const mal = [];
    let licencia = false;
    const marcado = texto.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, " "));
    for (const s of texto.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=|type\s*=\s*["'](application\/(ld\+)?json|importmap|text\/template)/i.test(s[1])) continue;
      const linea0 = texto.slice(0, s.index).split("\n").length;
      if (/\bflechaBuena\b/.test(s[2]) && /flecha\.js/.test(s[2])) licencia = true;
      mal.push(...enJavaScript(s[2], { parser, linea0 }));
    }
    mal.push(...enMarcado(marcado, { licencia }));
    return mal;
  }
  return enJavaScript(texto, { parser });
}

// Las dos que dibuja la web fuera de flecha.js, y por qué no son flechas a mano.
const EXCEPCIONES = [
  {
    archivo: "web/js/hero.js",
    funcion: "stopPaint",
    regla: "canvas",
    porque: "es la herramienta «flecha» del lienzo de dibujo: la traza el visitante con el ratón, recta, de donde pulsa a donde suelta, y no señala nada que la web elija; y hoy no la ve nadie (#demo-paint-canvas no está en ninguna página, y hero.js solo lo carga sections/_preview.html)",
  },
  {
    archivo: "web/demo/vivo.js",
    funcion: "pintarFlechas",
    regla: "calculada",
    porque: "son las aristas del lienzo de la app copiadas en la demo (React Flow): conectan dos tarjetas de lado a lado con la curva de React Flow y el trazo de app.css, sin punta, como en la app; medirlas como flechas a mano rompería el parecido con la app",
    // Si un día les sale punta, ya señalan: entonces son flechas y salen de flecha.js.
    sigue: () => {
      for (const n of ["web/demo/datos-es.html", "web/demo/datos-en.html"]) {
        const p = path.join(RAIZ, n);
        if (fs.existsSync(p) && /<marker\b|marker-(end|start)\s*=/.test(fs.readFileSync(p, "utf8"))) return `${n} pone una punta (<marker>) a las aristas del lienzo: ya son flechas, y salen de flecha.js`;
      }
      return null;
    },
  },
];

const babel = await cargar("@babel/parser");
const parser = babel.parse ? babel : babel.default;
// El detector, con lo que se le escapó a dos revisiones y con lo que no es una flecha.
const NS = "const NS = 'http://www.w3.org/2000/svg';\n";
const PRUEBAS_DEL_DETECTOR = [
  ["una flecha con la clase de siempre", true, "a.js", "const p = document.createElementNS('http://www.w3.org/2000/svg','path');\np.setAttribute('class','flecha-trazo');\np.setAttribute('d','M0 0 C10 10 20 0 30 30');\n"],
  ["una flecha con otra clase (nota-flechita)", true, "a.js", "const p = document.createElementNS('http://www.w3.org/2000/svg','path');\np.setAttribute('class','nota-flechita');\np.setAttribute('d','M0 0 C10 10 20 0 30 30 M24 22 L30 30 L22 28');\n"],
  ["una flecha escrita en una cadena", true, "a.js", "el.innerHTML = `<svg><path class=\"arrow\" d=\"M0 0 C10 10 20 0 30 30\"/></svg>`;\n"],
  ["trazarFlecha con el nombre de flechaBuena", true, "a.js", "import { trazarFlecha as flechaBuena } from './flecha.js';\nconst f = flechaBuena({ desde, hasta });\n"],
  ["una <polyline> con clase nota-flecha", true, "a.js", NS + "const p = document.createElementNS(NS, 'polyline');\np.setAttribute('class', 'nota-flecha');\np.setAttribute('points', '0,0 10,8 20,12 30,30 22,28 30,30 26,20');\n"],
  ["una ayuda svg('path')", true, "a.js", NS + "const svg = (t) => document.createElementNS(NS, t);\nconst p = svg('path');\np.setAttribute('class', 'nota-flecha');\np.setAttribute('d', 'M0 0 C10 10 20 0 30 30 M24 22 L30 30 L22 28');\n"],
  ["una flecha en un .html", true, "a.html", '<svg class="nota-flecha" viewBox="0 0 40 40"><path class="nota-flecha-trazo" d="M0 0 C10 10 20 0 30 30 M24 22 L30 30 L22 28"/></svg>\n'],
  ["una flecha que se llama nota-trazo", true, "a.js", NS + "const p = document.createElementNS(NS, 'path');\np.setAttribute('class', 'nota-trazo');\np.setAttribute('d', 'M0 0 C10 10 20 0 30 30 M24 22 L30 30 L22 28');\n"],
  ["el nombre ocho líneas después", true, "a.js", NS + "const p = document.createElementNS(NS, 'path');\np.setAttribute('d', 'M0 0 C10 10 20 0 30 30');\np.setAttribute('stroke-width', '3');\np.style.fill = 'none';\np.style.stroke = 'white';\np.style.opacity = '1';\np.dataset.x = '1';\np.setAttribute('class', 'nota-flecha');\n"],
  ["MEDIDAS de flecha.js y su propia flecha", true, "a.js", "import { MEDIDAS } from '../demo/flecha.js';\n" + NS + "const p = document.createElementNS(NS, 'path');\np.setAttribute('class', 'nota-flecha');\np.setAttribute('stroke-width', String(MEDIDAS.ancho));\np.setAttribute('d', 'M0 0 Q 5 30 10 0 M4 6 L10 0 L12 8');\n"],
  ["un canvas comentado como flecha", true, "a.js", "// la flecha de la nota\nconst ctx = document.querySelector('canvas').getContext('2d');\nctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(10, 10, 20, 0, 30, 30); ctx.lineTo(22, 28); ctx.stroke();\n"],
  ["la clase por parámetro y una flechaBuena de casa", true, "a.js", NS + "function flechaBuena({ desde }) { return { tallo: `M${desde.left} 0 Q 10 10 20 0`, punta: 'M0 0 L1 1 L2 0', ancho: 3, halo: 0 }; }\nconst trazo = (d, clase) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', clase); return p; };\nconst f = flechaBuena({ desde });\ntrazo(f.tallo, 'adeo-flecha-trazo');\n"],
  ["una flecha calculada sin flechaBuena", true, "a.js", NS + "const p = document.createElementNS(NS, 'path');\np.setAttribute('class', 'nota-flecha');\np.setAttribute('d', `M${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`);\n"],
  ["con su flechaBuena, otra hecha a mano", true, "a.js", "import { flechaBuena } from './flecha.js';\n" + NS + "const extra = document.createElementNS(NS, 'path');\nextra.setAttribute('class', 'adeo-flecha-trazo');\nextra.setAttribute('d', 'M100 100 Q 110 60 150 100 M140 92 L150 100 L138 104');\n"],
  ["una flecha grande sin nombre", true, "a.html", '<svg viewBox="0 0 400 200"><path class="nota" d="M10 150 C 60 40, 200 20, 300 90 M282 70 L300 90 L276 96"/></svg>\n'],
  ["la flecha buena, sacada de flecha.js", false, "a.js", "import { flechaBuena } from './flecha.js';\nconst p = document.createElementNS(NS, 'path');\np.setAttribute('class', 'adeo-flecha-trazo');\np.setAttribute('d', f.tallo);\n"],
  ["un icono que no es una flecha", false, "a.js", "x.innerHTML = '<svg viewBox=\"0 0 24 24\"><path d=\"M6.5 6.5l11 11M17.5 6.5l-11 11\"/></svg>';\nb.appendChild(x);\n"],
  ["el icono de la FAQ (pregunta__flecha, un chevrón)", false, "a.mjs", "export const pregunta = (q) => `<details class=\"pregunta\"><summary>${q}<svg class=\"pregunta__flecha\" viewBox=\"0 0 18 18\" fill=\"none\"><path d=\"M4.5 7l4.5 4.5L13.5 7\"/></svg></summary></details>`;\n"],
  ["el chevrón de la FAQ con su esquina redonda", false, "a.html", '<svg class="pregunta__flecha" fill="none" aria-hidden="true"><path d="m4.5 7.2 3.793 3.793a1 1 0 0 0 1.414 0L13.5 7.2" stroke="currentColor"/></svg>\n'],
  ["el icono i-flecha (tallo recto con su punta)", false, "a.html", '<symbol id="i-flecha" viewBox="0 0 24 24"><path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5" fill="none"/></symbol>\n<svg class="comparar__flecha"><use href="#i-flecha"/></svg>\n<svg class="comando__flecha"><path d="M5 11 11 5M6 5h5v5"/></svg>\n'],
  ["un lápiz comentado con «la punta abajo»", false, "a.js", "// el lápiz, con la punta abajo a la izquierda\nel.innerHTML = '<svg viewBox=\"0 0 24 24\"><path d=\"M4 20l4-1 11-11-3-3L5 16z\"/></svg>';\n"],
  ["el icono del botón «abrir aparte» (arrowIcon)", false, "a.js", "const arrowIcon = document.createElementNS('http://www.w3.org/2000/svg', 'path');\narrowIcon.setAttribute('d', 'M14.5 4H20v5.5');\n"],
  ["un icono de recargar (curvo, con punta, de 24)", false, "a.html", '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>\n'],
  ["las rutas que cambian de icono (FLECHA_SALE)", false, "a.js", "const FLECHA_SALE = 'M14.5 4H20v5.5';\nconst FLECHA_ENTRA = 'M12 6.5V12h5.5';\nfor (const ruta of $$('svg path', boton)) if (ruta.getAttribute('d') === FLECHA_SALE) ruta.setAttribute('d', FLECHA_ENTRA);\n"],
  ["un canvas que pinta una línea", false, "a.js", "const ctx = c.getContext('2d');\nfunction linea(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }\n"],
];
for (const [nombre, esMala, archivo, texto] of PRUEBAS_DEL_DETECTOR) {
  const mal = revisarArchivo(texto, archivo, parser);
  if (mal.length > 0 !== esMala) fallos.push(`el detector de archivos se equivoca con ${nombre}: la da por ${esMala ? "buena" : `mala (${mal.map((m) => m.texto).join("; ")})`}`);
}

// Y la web de verdad.
const hallazgos = [];
let leidos = 0;
for (const { ruta, rel } of archivosDeLaWeb(/\.(js|mjs|html?)$/i)) {
  if (rel === "web/demo/flecha.js") continue;
  leidos++;
  for (const h of revisarArchivo(fs.readFileSync(ruta, "utf8"), rel, parser)) hallazgos.push({ ...h, archivo: rel });
}
for (const ex of EXCEPCIONES) {
  const suyos = hallazgos.filter((h) => h.archivo === ex.archivo && h.funcion === ex.funcion && h.regla === ex.regla);
  const existe = fs.existsSync(path.join(RAIZ, ex.archivo));
  if (existe && !suyos.length) fallos.push(`la excepción de ${ex.archivo} (${ex.funcion}) ya no encuentra su flecha: quítala de EXCEPCIONES, o el detector dejó de verla`);
  if (suyos.length > 1) fallos.push(`${ex.archivo} (${ex.funcion}) dibuja ${suyos.length} flechas y su excepción es para una: ${suyos.map((h) => `línea ${h.linea}`).join(", ")}`);
  const roto = existe && ex.sigue?.();
  if (roto) fallos.push(`la excepción de ${ex.archivo} (${ex.funcion}) ya no vale: ${roto}`);
  for (const h of suyos.slice(0, 1)) h.excepcion = ex;
}
for (const h of hallazgos) if (!h.excepcion) fallos.push(`${h.archivo}:${h.linea}${h.funcion ? ` (${h.funcion})` : ""} ${h.texto}`);
resumen.push(`nadie dibuja una flecha por su cuenta en ${leidos} archivos de la web (${EXCEPCIONES.length} excepciones con su porqué, y el detector pasa sus ${PRUEBAS_DEL_DETECTOR.length} pruebas)`);

if (fallos.length) {
  console.error("FALLA  flechas-check:\n  " + fallos.join("\n  "));
  process.exit(1);
}
console.log(`OK  flechas-check: ${resumen.join("; ")}`);
// jsdom deja relojes vivos: sin esto el proceso no acaba.
process.exit(0);
