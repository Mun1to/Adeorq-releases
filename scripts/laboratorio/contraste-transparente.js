// «Terminales transparentes» también en Contraste (Munir, 2026-11-17, con la tabla de temas:
// «en el que estoy ahora no se puede activar que se vea lo de detrás de las terminales»).
//
// Contraste pone dos capas negras fijas entre la foto y las terminales: la rejilla
// (`.grid`, al 45 %) y un velo encima de la foto (`.fondo::after`, al 40 %). El mando
// «cuánto se ve a través de las terminales» de Ajustes abre el panel y el lienzo de xterm,
// pero esas dos se quedaban: al 100 % la foto seguía tapada un 67 %. Esto mide, con el
// tema puesto y una terminal abierta, cuánto tapan juntas todas las capas que hay entre la
// foto y el texto:
//   - en automático (el mando sin tocar), Contraste se ve como siempre: rejilla 0,45 y velo 0,4;
//   - al 100 %, no tapa casi nada (menos de un 5 %), como en los demás temas;
//   - a la mitad, la rejilla y el velo van a la mitad.
//
// Con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/contraste-transparente.js
// Con FOTO=<carpeta> deja una foto con el mando al 100 %. Devuelve { pasos, fallos }.
// Desde el 2026-11-17 la forma de Contraste es la de todos los temas oscuros: con
// TEMA=<id> (violeta, oceano…) mide lo mismo con ese tema puesto.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const foto = globalThis.process?.env?.FOTO;
  const TEMA = globalThis.process?.env?.TEMA || "contraste";

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  // El doble vacía el localStorage en cada carga (salvo el tema): el mando se repone
  // detrás de él desde sessionStorage, que sí sobrevive a la recarga.
  await page.addInitScript(() => {
    const v = sessionStorage.getItem("lab-terminal-ver");
    if (v != null) localStorage.setItem("adeorq-terminal-ver", v);
    localStorage.setItem("adeorq-ajustes-seccion", "aspecto");
  });

  /** Pone el tema y el mando, recarga y abre una terminal en la Cabina. */
  const preparar = async (ver) => {
    await page.evaluate(({ v, tema }) => {
      localStorage.setItem("adeorq-theme", tema);
      sessionStorage.setItem("lab-terminal-ver", String(v));
    }, { v: ver, tema: TEMA });
    await page.reload();
    await page.waitForTimeout(1500);
    await page.locator('.topbar button[data-tip="Cabina"], .tabs button:has-text("Cabina")').first().click().catch(() => {});
    await page.waitForTimeout(400);
    if (!(await page.locator(".grid > .pane").count())) {
      await page.evaluate(() => document.querySelector("button.mini.mini-claude")?.click());
      await page.waitForTimeout(1500);
    }
  };

  /** Lo que tapa cada capa entre la foto y el texto, y lo que tapan juntas. */
  const capas = () => page.evaluate(() => {
    const alfa = (c) => {
      if (!c || c === "transparent") return 0;
      // El lienzo de la terminal va escrito como mezcla con transparente
      // (`color-mix(in srgb, <fondo del tema> 42%, transparent)`): tapa ese tanto.
      const mezcla = c.match(/^color-mix\(in srgb, .+ ([\d.]+)%, transparent\)$/);
      if (mezcla) return Number(mezcla[1]) / 100;
      const m = c.match(/rgba?\(([^)]+)\)/) ?? c.match(/color\(srgb ([^)]+)\)/);
      if (!m) return 1;
      const p = m[1].split(/[\s,/]+/).filter(Boolean);
      return p.length >= 4 ? Number(p[3]) : 1;
    };
    const tema = document.documentElement.getAttribute("data-theme");
    const fondo = document.querySelector(".fondo");
    const grid = document.querySelector(".grid");
    const pane = document.querySelector(".grid > .pane");
    // El tono: los tres números de un `rgb(a)` escrito, o el que el navegador da
    // a cualquier color (el `--panel-solid` del tema va en hexadecimal).
    const tono = (c) => {
      const m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
      if (m) return m.slice(1, 4).map(Number);
      const prueba = document.createElement("i");
      prueba.style.color = c;
      document.body.append(prueba);
      const r = getComputedStyle(prueba).color.match(/([\d.]+)/g)?.slice(0, 3).map(Number) ?? null;
      prueba.remove();
      return r;
    };
    const raiz = getComputedStyle(document.documentElement);
    const r = {
      tema,
      hayFoto: !!fondo,
      velo: fondo ? alfa(getComputedStyle(fondo, "::after").backgroundColor) : null,
      rejilla: grid ? alfa(getComputedStyle(grid).backgroundColor) : null,
      panel: pane ? alfa(getComputedStyle(pane).backgroundColor) : null,
      xterm: alfa(raiz.getPropertyValue("--xterm-bg").trim()),
      // Con el mando movido, el tinte de la terminal se escribe como rgba: su tono
      // tiene que ser el fondo del tema, no el azul de la casa.
      tonoXterm: /^rgba?\(/.test(raiz.getPropertyValue("--xterm-bg").trim()) ? tono(raiz.getPropertyValue("--xterm-bg").trim()) : null,
      tonoTema: tono(raiz.getPropertyValue("--panel-solid").trim()),
    };
    const lista = [r.velo, r.rejilla, r.panel, r.xterm].filter((x) => typeof x === "number");
    r.tapa = Number((1 - lista.reduce((a, x) => a * (1 - x), 1)).toFixed(3));
    return r;
  });

  await preparar(-1);
  pasos.auto = await capas();
  debe(pasos.auto.tema === TEMA, `el tema no es «${TEMA}»: ${pasos.auto.tema}`);
  debe(Math.abs((pasos.auto.xterm ?? 0) - 0.42) < 0.02, `en automático el lienzo de la terminal no es el de Contraste (0,42): ${pasos.auto.xterm}`);
  debe(pasos.auto.hayFoto, "no hay foto de fondo (el doble la sirve desde .playwright-mcp/fondo.png)");
  debe(pasos.auto.rejilla != null && pasos.auto.panel != null, "no hay terminal abierta en la Cabina");
  debe(Math.abs((pasos.auto.rejilla ?? 0) - 0.45) < 0.02, `en automático la rejilla no es la de Contraste (0,45): ${pasos.auto.rejilla}`);
  debe(Math.abs((pasos.auto.velo ?? 0) - 0.4) < 0.02, `en automático el velo no es el de Contraste (0,4): ${pasos.auto.velo}`);

  await preparar(100);
  pasos.cien = await capas();
  debe(pasos.cien.tapa < 0.05, `al 100 % las capas siguen tapando la foto un ${Math.round(pasos.cien.tapa * 100)} % (velo ${pasos.cien.velo}, rejilla ${pasos.cien.rejilla}, panel ${pasos.cien.panel}, xterm ${pasos.cien.xterm})`);
  if (foto) await page.screenshot({ path: `${foto}/contraste-al-100.png` });

  await preparar(50);
  pasos.mitad = await capas();
  debe(Math.abs((pasos.mitad.rejilla ?? 0) - 0.225) < 0.03, `a la mitad la rejilla no baja a la mitad (0,225): ${pasos.mitad.rejilla}`);
  debe(Math.abs((pasos.mitad.velo ?? 0) - 0.2) < 0.03, `a la mitad el velo no baja a la mitad (0,2): ${pasos.mitad.velo}`);
  /** El tinte del mando tiene el tono del fondo del tema (con 6 de holgura por canal: Tinta va a mano). */
  const mismoTono = (p) => !!p.tonoXterm && !!p.tonoTema && p.tonoXterm.every((v, i) => Math.abs(v - p.tonoTema[i]) <= 6);
  debe(mismoTono(pasos.mitad), `a la mitad el tinte de la terminal no es del tema «${TEMA}»: ${pasos.mitad.tonoXterm} y su fondo es ${pasos.mitad.tonoTema}`);

  // Cambiar de tema con el mando puesto, sin recargar: el tinte sigue al tema nuevo.
  const OTRO = TEMA === "oceano" ? "violeta" : "oceano";
  await page.evaluate(() => document.querySelector('[data-tab="ajustes"]')?.click());
  await page.locator(`.tema-tarjeta:has(.tema-prev[data-tema-prev="${OTRO}"])`).click({ timeout: 8000 }).catch((e) => fallos.push(`no pude pulsar el tema «${OTRO}» en Ajustes › Aspecto: ${e.message.split("\n")[0]}`));
  await page.waitForTimeout(600);
  pasos.cambio = await capas();
  debe(pasos.cambio.tema === OTRO, `tras pulsarlo, el tema no es «${OTRO}»: ${pasos.cambio.tema}`);
  debe(mismoTono(pasos.cambio), `al cambiar a «${OTRO}» con el mando a la mitad, el tinte se queda en ${pasos.cambio.tonoXterm} y el fondo del tema es ${pasos.cambio.tonoTema}`);

  await page.evaluate(() => sessionStorage.removeItem("lab-terminal-ver"));
  return { pasos, fallos };
}
