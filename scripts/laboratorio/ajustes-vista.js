// Ajustes › Aspecto y Terminales con la vista al lado y el número que se
// escribe. Munir, 2026-11-24: «quiero que sea mas pequeño lo de los ejemplos y
// poner a la derecha un como se veria en tu termnal para no estar yendo y
// volviendo y que los apartados numericos puedas hacer doble click y editarlo
// con el teclado para mas rapidez y ser mas concreto».
//
// Mira, con el doble de Tauri y sin la app:
//   - a 1920 y a 1536 (su monitor al 125 %) la vista va en una tercera columna,
//     a la derecha de la hoja, y sigue a la vista al bajar hasta el fondo;
//   - a 1100 sube encima de la hoja;
//   - doble clic en el tamaño de la letra abre un campo: 20 e Intro lo deja en
//     20 px (en el deslizador, en la cifra y en la vista); 99 se queda en 32, el
//     tope; Escape deshace sin cerrar Ajustes;
//   - elegir otro esquema de terminal cambia el color de la vista.
// Se lanza con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/ajustes-vista.js
// Deja fotos en %TEMP% (ajustes-vista-*.png). Devuelve { pasos, fallos }.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const fotos = (process.env.TEMP || process.env.TMPDIR || ".").replace(/\\/g, "/");

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);

  const abrir = async (seccion, ancho, alto) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await page.addInitScript((s) => {
      try {
        localStorage.setItem("adeorq-lang", "es");
        localStorage.setItem("adeorq-ajustes-seccion", s);
      } catch { /* sin almacén */ }
    }, seccion);
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="cabina"]').waitFor({ state: "attached", timeout: 20000 });
    await page.evaluate(() => document.querySelector('[data-tab="ajustes"]').click());
    await page.locator(".set-vista").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(500);
  };

  const donde = () => page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const v = r(".set-vista"), h = r(".set-hoja");
    return { vista: v && [Math.round(v.left), Math.round(v.top), Math.round(v.width)], hoja: h && [Math.round(h.left), Math.round(h.right), Math.round(h.top)] };
  });

  // 1. Dónde va la vista, a tres anchos.
  for (const [ancho, alto] of [[1920, 1080], [1536, 864], [1100, 800]]) {
    await abrir("aspecto", ancho, alto);
    const d = await donde();
    pasos[`aspecto ${ancho}`] = d;
    if (ancho >= 1536) debe(d.vista[0] >= d.hoja[1], `a ${ancho} la vista va a la derecha de la hoja (${JSON.stringify(d)})`);
    else debe(d.vista[1] < d.hoja[2], `a ${ancho} la vista va encima de la hoja (${JSON.stringify(d)})`);
    await page.screenshot({ path: `${fotos}/ajustes-vista-aspecto-${ancho}.png` });
    if (ancho >= 1536) {
      // Bajar hasta el fondo: la vista sigue arriba, a la vista.
      await page.evaluate(() => {
        for (const e of document.querySelectorAll(".panel.settings, .panel.settings *")) {
          if (e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight;
        }
      });
      await page.waitForTimeout(300);
      const abajo = await page.evaluate(() => {
        const v = document.querySelector(".set-vista").getBoundingClientRect();
        return [Math.round(v.top), Math.round(v.bottom), innerHeight];
      });
      pasos[`aspecto ${ancho} abajo`] = abajo;
      debe(abajo[0] >= 0 && abajo[1] <= abajo[2], `a ${ancho}, bajando hasta el fondo la vista sigue entera en pantalla (${abajo})`);
      await page.screenshot({ path: `${fotos}/ajustes-vista-aspecto-${ancho}-abajo.png` });
    }
  }

  // 2. Otro esquema de terminal cambia el color de la vista.
  await abrir("aspecto", 1920, 1080);
  const color = () => page.evaluate(() => getComputedStyle(document.querySelector(".vista-term-cuerpo")).color);
  const antes = await color();
  // Uno cuya letra sea de otro color que la de ahora: «De la casa» pinta igual
  // que «A juego con el tema» con el tema de fábrica, y no probaría nada.
  pasos.elegido = await page.evaluate((ahora) => {
    const letra = (b) => getComputedStyle(b.querySelector(".term-prev span:nth-child(3)")).color;
    const t = [...document.querySelectorAll(".term-tarjeta")].find((b) => b.dataset.on !== "true" && letra(b) !== ahora);
    t.click();
    return t.dataset.temaTerm;
  }, antes);
  await page.waitForTimeout(300);
  pasos.esquema = [antes, await color()];
  debe(pasos.esquema[0] !== pasos.esquema[1], `elegir otro esquema cambia el color de la vista (${pasos.esquema})`);

  // 3. El número de la letra, con doble clic, en Terminales.
  await abrir("terminales", 1920, 1080);
  const fila = page.locator(".setting-row", { hasText: /Tamaño (máximo )?de la letra/ }).first();
  const leer = () => fila.evaluate((f) => ({
    deslizador: f.querySelector('input[type="range"]').value,
    cifra: f.querySelector(".setting-value-editable")?.textContent ?? null,
    vista: getComputedStyle(document.querySelector(".vista-term-cuerpo")).fontSize,
    ajustes: !!document.querySelector(".set-vista"),
  }));
  await fila.locator(".setting-value-editable").dblclick();
  const campo = fila.locator(".setting-value-campo");
  debe(await campo.isVisible(), "doble clic en la cifra abre el campo");
  await campo.fill("20");
  await campo.press("Enter");
  await page.waitForTimeout(200);
  pasos.veinte = await leer();
  debe(pasos.veinte.deslizador === "20" && pasos.veinte.cifra === "20px" && pasos.veinte.vista === "20px", `20 e Intro deja la letra en 20 px (${JSON.stringify(pasos.veinte)})`);
  await page.screenshot({ path: `${fotos}/ajustes-vista-terminales-20.png` });

  await fila.locator(".setting-value-editable").dblclick();
  await campo.fill("99");
  await campo.press("Enter");
  await page.waitForTimeout(200);
  pasos.noventa = await leer();
  debe(pasos.noventa.deslizador === "32", `99 se queda en el tope, 32 (${JSON.stringify(pasos.noventa)})`);

  await fila.locator(".setting-value-editable").dblclick();
  await campo.fill("14");
  await campo.press("Escape");
  await page.waitForTimeout(200);
  pasos.escape = await leer();
  debe(pasos.escape.deslizador === "32" && pasos.escape.ajustes, `Escape deshace y no cierra Ajustes (${JSON.stringify(pasos.escape)})`);

  // Lo deja como estaba para la siguiente vuelta.
  await page.evaluate(() => localStorage.clear());
  return { pasos, fallos };
}
