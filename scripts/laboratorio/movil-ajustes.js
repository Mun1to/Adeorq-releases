// Los Ajustes del móvil (2026-10-16, Munir: «hazlo más customizable»): la foto
// de detrás del cristal (la del PC, una del móvil o ninguna) con su velo y su
// desenfoque, el tema y el acento (de entrada los del PC), la letra, Adeo, el
// orden del inicio, qué avisos quiere este móvil y olvidarlo.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-ajustes.js
//
// Devuelve { pasos, fallos }. Al final el móvil se olvida a sí mismo: el doble
// queda sin clave, así que va el último o con un doble recién arrancado.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  const alDoble = (ruta, cuerpo) =>
    fetch(`${B}${ruta}`, { method: cuerpo ? "POST" : "GET", headers: { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }).then((r) => r.json());
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));

  await page.setViewportSize({ width: 412, height: 915 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${B}/`);
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);
  // El PC con foto, violeta, la foto al 55 % y 4 px de desenfoque.
  await alDoble("/api/sembrar-aspecto", { acento: "#a877ff", opacidad: 55, desenfoque: 4, foto: 1 });
  await page.goto(`${B}/?v=1`);
  await page.waitForSelector("#portada-term");
  await page.waitForFunction(() => document.body.dataset.foto !== undefined, null, { timeout: 8000 }).catch(() => {});

  const aspecto = () => page.evaluate(() => {
    const r = document.documentElement;
    const b = document.body;
    return {
      tema: r.dataset.tema, acento: r.dataset.acento ?? null, z: r.style.getPropertyValue("--z"), adeo: r.dataset.adeo,
      fondo: getComputedStyle(r).getPropertyValue("--fondo").trim(),
      foto: b.dataset.foto !== undefined, url: b.style.getPropertyValue("--foto"),
      velo: b.style.getPropertyValue("--foto-velo"), desenfoque: b.style.getPropertyValue("--foto-desenfoque"),
    };
  });
  pasos.deEntrada = await aspecto();
  const e0 = pasos.deEntrada;
  debe(e0.tema === "oscuro", `de entrada sigue al teléfono, en oscuro (${e0.tema})`);
  debe(e0.acento === "#a877ff", `de entrada, el acento del PC (${e0.acento})`);
  debe(e0.foto && /^url\("blob:/.test(e0.url), `de entrada, la foto del PC (${e0.url})`);
  debe(e0.velo === "0.45" && e0.desenfoque === "4px", `el cristal como en el PC: se ve el 55 % y 4 px (${e0.velo}, ${e0.desenfoque})`);

  const entrar = async () => {
    await page.click("#abrir-cajon");
    await page.click("#cajon .a-ajustes");
    await page.waitForSelector("#ajustes .foto-op");
    await page.waitForTimeout(300);
  };
  const tocar = async (sel) => { await page.click(sel); await page.waitForTimeout(150); };
  const marcado = (sel) => page.$eval(sel, (b) => b.getAttribute("aria-checked") === "true" || b.checked === true);

  await entrar();
  pasos.pantalla = await page.evaluate(() => ({
    secciones: [...document.querySelectorAll("#ajustes .seccion")].map((s) => s.textContent.trim()),
    ancho: document.querySelector(".cuerpo").scrollWidth <= document.querySelector(".cuerpo").clientWidth + 1,
    actual: document.querySelector('#cajon .a-ajustes')?.getAttribute("aria-current"),
  }));
  debe(JSON.stringify(pasos.pantalla.secciones) === JSON.stringify(["Fondo", "Colores", "Letra", "Adeo", "El inicio", "Avisos", "Este móvil"]), `las secciones de Ajustes (${pasos.pantalla.secciones})`);
  debe(pasos.pantalla.ancho, "Ajustes no se sale de la pantalla");
  debe(await marcado('[data-ajuste="fondo"][data-valor="pc"]'), "la foto del PC sale elegida");
  debe(await marcado('[data-ajuste="acento"][data-valor="pc"]'), "el acento del PC sale elegido");

  // El tema: forzado a claro y a oscuro, y vuelta a como el teléfono.
  await tocar('[data-ajuste="tema"][data-valor="claro"]');
  const claro = await aspecto();
  debe(claro.tema === "claro" && claro.fondo === "#e8eef8", `Claro pone el tema claro aunque el teléfono vaya en oscuro (${claro.tema}, ${claro.fondo})`);
  await tocar('[data-ajuste="tema"][data-valor="sistema"]');
  debe((await aspecto()).tema === "oscuro", "Automático vuelve a seguir al teléfono");

  // El acento: uno de la casa, y vuelta al del PC.
  await tocar('[data-ajuste="acento"][data-valor="#46c99a"]');
  const verde = await aspecto();
  const botonVerde = await page.$eval(".interruptor:checked", (i) => getComputedStyle(i).backgroundColor);
  debe(verde.acento === "#46c99a" && botonVerde === "rgb(70, 201, 154)", `el verde pinta los interruptores (${verde.acento}, ${botonVerde})`);
  await tocar('[data-ajuste="acento"][data-valor="pc"]');
  debe((await aspecto()).acento === "#a877ff", "«El de tu PC» vuelve al violeta del PC");

  // El cristal propio: sale con lo del PC y se mueve con el dedo.
  await tocar('[data-ajuste="cristal"]');
  const ve = await page.$eval('input[data-ajuste="ve"]', (i) => i.value);
  debe(ve === "55", `al quitar «como en tu PC» se empieza desde lo del PC (${ve})`);
  await page.$eval('input[data-ajuste="ve"]', (i) => { i.value = "30"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.$eval('input[data-ajuste="desenfoque"]', (i) => { i.value = "12"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  const cristal = await aspecto();
  debe(cristal.velo === "0.7" && cristal.desenfoque === "12px", `los deslizadores cambian el velo y el desenfoque al momento (${cristal.velo}, ${cristal.desenfoque})`);
  debe(await page.$eval("#ve-valor", (o) => o.textContent) === "30 %", "el deslizador dice su valor");

  // Una foto del móvil: un PNG hecho aquí, por el selector de archivos.
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 90; c.height = 160;
    const x = c.getContext("2d");
    x.fillStyle = "#1a8f5a"; x.fillRect(0, 0, 90, 160);
    x.fillStyle = "#f5c542"; x.fillRect(20, 40, 50, 60);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.setInputFiles("#foto-propia", { name: "mia.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.waitForFunction(() => document.querySelector('[data-ajuste="fondo"][data-valor="propia"]')?.getAttribute("aria-checked") === "true", null, { timeout: 5000 }).catch(() => {});
  const propia = await aspecto();
  const guardada = await page.evaluate(() => JSON.parse(localStorage.getItem("adeorq-movil-foto-propia") || "{}").datos?.slice(0, 23));
  debe(propia.foto && propia.url !== e0.url && guardada === "data:image/jpeg;base64,", `la foto del móvil se guarda en JPEG y se pone detrás (${guardada}, ${propia.url})`);
  await tocar('[data-ajuste="fondo"][data-valor="nada"]');
  debe(!(await aspecto()).foto, "«Sin foto» la quita");
  await tocar('[data-ajuste="fondo"][data-valor="propia"]');
  debe((await aspecto()).foto, "volver a «De este móvil» la pone sin pedir otra");

  // La letra: el saludo crece con «Muy grande».
  await tocar('[data-ajuste="letra"][data-valor="1.25"]');
  const z = (await aspecto()).z;
  const tamCaja = await page.$eval(".fila-ajuste > span", (s) => parseFloat(getComputedStyle(s).fontSize));
  debe(z === "1.25" && Math.abs(tamCaja - 18.75) < 0.05, `«Muy grande» multiplica la letra por 1,25 (${z}, ${tamCaja}px)`);

  // Adeo escondido y el inicio en otro orden, sin «En marcha» y sin la caja.
  await tocar('[data-ajuste="adeo"][data-valor="oculto"]');
  await tocar('[data-mover="conversaciones"][data-paso="-1"]');
  await tocar('[data-mover="conversaciones"][data-paso="-1"]');
  await tocar('[data-mover="conversaciones"][data-paso="-1"]');
  await page.click('[data-seccion="marcha"]');
  await page.waitForTimeout(150);
  await page.click('[data-ajuste="caja"]');
  await page.waitForTimeout(150);
  pasos.ordenEnAjustes = await page.$$eval("#ajustes .fila-ajuste [data-mover][data-paso='1']", (bs) => bs.map((b) => b.dataset.mover));
  debe(JSON.stringify(pasos.ordenEnAjustes) === JSON.stringify(["conversaciones", "saludo", "reclaman", "marcha"]), `Conversaciones sube al principio (${pasos.ordenEnAjustes})`);

  await page.click("#abrir-cajon");
  await page.click('#cajon .fila[data-ir="lista"]');
  await page.waitForSelector("#portada-term", { state: "attached" });
  await page.waitForTimeout(1200);
  pasos.inicio = await page.evaluate(() => ({
    orden: [...document.querySelectorAll(".cuerpo > div")].map((d) => d.id || d.className),
    marchaEscondida: document.getElementById("portada-term").hidden,
    adeoSeVe: [...document.querySelectorAll(".masc")].some((m) => m.getBoundingClientRect().width > 0),
    caja: !document.querySelector("footer.caja").hidden,
    vacio: document.querySelector("#filas .vacio")?.textContent ?? null,
  }));
  const ini = pasos.inicio;
  debe(ini.orden[0] === "filas", `el inicio empieza por las conversaciones (${ini.orden})`);
  debe(ini.marchaEscondida, "«En marcha» no sale");
  debe(!ini.adeoSeVe, "Adeo escondido no se ve");
  debe(!ini.caja, "sin la caja para escribir");
  // Sin la caja, «Nuevo encargo» abre una conversación con la suya.
  await page.click("#abrir-cajon");
  await page.click("#nuevo-encargo");
  await page.waitForTimeout(500);
  pasos.nuevoSinCaja = await page.evaluate(() => ({ hayCaja: !!document.querySelector(".vista textarea"), enLista: !!document.getElementById("portada-term") }));
  debe(pasos.nuevoSinCaja.hayCaja && !pasos.nuevoSinCaja.enLista, `sin la caja del inicio, «Nuevo encargo» abre una conversación (${JSON.stringify(pasos.nuevoSinCaja)})`);

  // Adeo quieto: no cambia de postura en dos segundos.
  await entrar();
  await tocar('[data-ajuste="adeo"][data-valor="quieto"]');
  await page.click("#abrir-cajon");
  await page.click('#cajon .fila[data-ir="lista"]');
  await page.waitForSelector(".masc", { state: "attached" });
  const v1 = await page.$eval(".masc", (m) => m.dataset.v);
  await page.waitForTimeout(2200);
  const v2 = await page.$eval(".masc", (m) => m.dataset.v);
  debe(v1 === v2, `Adeo quieto no se mueve (${v1} → ${v2})`);

  // Lo elegido aguanta una recarga.
  await page.reload();
  await page.waitForSelector("#filas", { state: "attached" });
  const tras = await aspecto();
  debe(tras.z === "1.25" && tras.adeo === "quieto" && tras.foto, `tras recargar sigue como lo dejaste (${JSON.stringify(tras)})`);

  // Los avisos de este móvil: el PC se entera de cuáles quiere.
  await entrar();
  await page.waitForSelector('[data-aviso="terminadas"]:not([disabled])', { timeout: 5000 }).catch(() => {});
  await page.click('[data-aviso="terminadas"]');
  await page.waitForTimeout(300);
  await page.waitForSelector('[data-aviso="sonido"]:not([disabled])', { timeout: 5000 }).catch(() => {});
  await page.click('[data-aviso="sonido"]');
  await page.waitForTimeout(300);
  pasos.avisos = (await alDoble("/api/avisos-guardados")).avisos;
  debe(pasos.avisos?.terminadas === false && pasos.avisos?.silencio === true && pasos.avisos?.preguntas === true, `el PC guarda qué avisos quiere (${JSON.stringify(pasos.avisos)})`);
  debe(!(await page.$eval('[data-aviso="terminadas"]', (i) => i.checked)), "el interruptor se queda como lo dejaste");

  // Como venía: el aspecto de fábrica (con lo del PC), los avisos no se tocan.
  await tocar("#de-fabrica");
  const fabrica = await aspecto();
  debe(fabrica.z === "1" && fabrica.adeo === "vivo" && fabrica.acento === "#a877ff" && /^url\("blob:/.test(fabrica.url) && fabrica.velo === "0.45", `«Como venía» vuelve a lo del PC (${JSON.stringify(fabrica)})`);

  // Olvidar este móvil: dos toques, y vuelve a emparejar.
  await page.click("#olvidarme");
  await page.waitForTimeout(150);
  const aviso = await page.$eval("#olvidarme", (b) => b.textContent);
  debe(/otra vez/.test(aviso) && !!(await page.$("#ajustes")), `el primer toque solo avisa (${aviso})`);
  await page.click("#olvidarme");
  await page.waitForSelector(".emparejar", { timeout: 5000 }).catch(() => {});
  pasos.olvidado = await page.evaluate(() => ({ emparejar: !!document.querySelector(".emparejar"), clave: localStorage.getItem("adeorq-movil-clave") }));
  debe(pasos.olvidado.emparejar && !pasos.olvidado.clave, `el segundo lo olvida y pide emparejar (${JSON.stringify(pasos.olvidado)})`);

  debe(!errores.length, `sin errores en la página (${errores.join(" | ")})`);
  return { pasos, fallos };
}
